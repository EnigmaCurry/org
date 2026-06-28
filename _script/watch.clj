#!/usr/bin/env bb
;; Dev watch loop: serve Hugo with live-reload while re-exporting Org -> Markdown
;; whenever the sources change.
;;
;; Two modes (selected by the AUTOPULL env var, set by `make autowatch`):
;;
;;   make watch     - LOCAL editing. Re-export when the local .org sources change,
;;                    detected by polling their mtimes.
;;
;;   make autowatch - LOCAL editing PLUS remote sync. Watches the local .org
;;                    sources (like `make watch`) AND polls git: when the
;;                    upstream branch advances, `git pull --ff-only` and THEN
;;                    re-export. The pull and the rebuild run in one sequence, so
;;                    the export always reads the freshly-pulled files and fires
;;                    exactly once per new commit. Rebuilds from the two watchers
;;                    are serialized by build-lock, and a pull re-baselines the
;;                    local watcher so it doesn't rebuild again for the same
;;                    change.
;;                    (The old design spawned a separate `git autopull` and let an
;;                    mtime watcher guess when it finished — a race that exported
;;                    stale sources, the cause of "reloads but never updates".)
;;
;; Hugo's own server watches everything under hugo/ and live-reloads the browser;
;; this script only regenerates the Org -> Markdown, which Hugo then picks up.
;;
;; Why two content dirs (content vs content-live):
;;   ox-hugo re-exports EVERY subtree to its own .md and rewrites them all (even
;;   unchanged ones) over the multi-second Emacs export. If Hugo watched that dir
;;   directly it would see the staggered writes as ~10 separate change events and
;;   live-reload the browser ~10 times per build. So ox-hugo writes to
;;   hugo/content (unwatched), and after each build we `rsync --checksum` only the
;;   genuinely-changed files into hugo/content-live (what Hugo serves) in one fast
;;   burst — Hugo coalesces that into a single reload, or none if nothing changed.

(require '[babashka.fs :as fs]
         '[babashka.process :as p]
         '[clojure.string :as str])

(def repo (-> *file* fs/absolutize fs/parent fs/parent str))

;; Org sources (and the build engine) consumed by `make build-md`.
(def watch-globs
  ["books.org" "license.org" "notes.org"
   "books/**" "notes/**"
   "src/**"
   "emacs.d/init.el"])

(defn source-files []
  (->> watch-globs
       (mapcat #(fs/glob repo %))
       (filter fs/regular-file?)
       (map str)
       sort))

(defn snapshot []
  (into {} (for [f (source-files)]
             [f (fs/file-time->millis (fs/last-modified-time f))])))

;; Shared baseline of source mtimes. The local watcher compares against this;
;; a git-pull rebuild resets it so the pull's own mtime bumps don't trigger a
;; second, redundant local rebuild.
(def source-baseline (atom nil))

;; ox-hugo exports here (unwatched); Hugo serves from `serve-dir`.
(def content-dir (str (fs/path repo "hugo" "content")))
(def serve-dir   (str (fs/path repo "hugo" "content-live")))

;; A throwaway extra config file Hugo loads via `--config` (see `start-hugo`).
;; Rewriting it forces Hugo to do a *full* rebuild -- see `force-full-rebuild!`.
;; It's gitignored and contains only a comment, so it never affects the output.
(def nonce-file (str (fs/path repo "hugo" ".watch-nonce.toml")))
(def nonce-counter (atom 0))

(defn force-full-rebuild!
  "Make Hugo's server do a COMPLETE rebuild by writing a fresh value to the extra
config file it watches.

Why this is necessary: one source edit can regenerate several Markdown files at
once -- e.g. editing `step-function-shader` rewrites both step-function.md AND
the whirlpool.md that diffs against it. Hugo's *incremental* server rebuild
mishandles such multi-file batches: it re-renders one of the changed pages but
serves a STALE render of the other (the dependent diff never updates, until you
restart `hugo server`). A content change triggers that buggy partial rebuild; a
*config* change triggers a full, correct rebuild instead. Bumping this file right
after the content sync coalesces with the content events into a single full
rebuild -- one live-reload, always fresh. (A mere `touch`/mtime bump is NOT
enough; Hugo only reacts to a real write, hence we rewrite the contents.)"
  []
  (spit nonce-file (format "# watch full-rebuild nonce %d\n" (swap! nonce-counter inc))))

(defn sync-content!
  "Mirror only the genuinely-changed files from content-dir into serve-dir, then
force a full Hugo rebuild.

`--checksum` ignores ox-hugo's gratuitous mtime bumps and compares by content, so
unchanged pages are not re-touched; the changed ones land in one fast burst.
`--inplace` writes them as plain in-place modifications rather than the
temp-file+rename rsync does by default, which keeps Hugo's file watcher reliable.
The actual fix for stale dependent pages is `force-full-rebuild!` -- see there."
  []
  (fs/create-dirs serve-dir)
  (let [{:keys [exit]} @(p/process {:dir repo :err :inherit}
                                   "rsync" "-r" "--checksum" "--delete" "--inplace"
                                   (str content-dir "/") (str serve-dir "/"))]
    (when-not (zero? exit)
      (println "✗ rsync content -> content-live failed")))
  (force-full-rebuild!))

;; Serialize rebuilds: in autowatch both the git-pull watcher and the local
;; source watcher can fire, and a concurrent `make build-md` would corrupt the
;; export. Every rebuild goes through this lock.
(def build-lock (Object.))

(defn build-md! []
  (locking build-lock
    (println "↻ re-exporting Markdown ...")
    (let [{:keys [exit]} @(p/process {:dir repo :inherit true} "make" "build-md")]
      (if (zero? exit)
        (do (sync-content!)
            (println "✓ Markdown rebuilt — Hugo will live-reload"))
        (println "✗ make build-md failed — see output above")))))

(def hugo-cmd (or (System/getenv "HUGO") "hugo"))

(defn start-hugo []
  (println "▶ starting Hugo server (http://localhost:1313) ...")
  (force-full-rebuild!) ;; ensure the nonce config exists before Hugo loads it
  (sync-content!) ;; seed content-live from the build that ran before this script
  ;; `--config hugo.toml,.watch-nonce.toml`: load the real config plus our
  ;; throwaway nonce file, so rewriting the nonce forces a full rebuild (see
  ;; `force-full-rebuild!`). Paths are relative to the `cd hugo` working dir.
  (p/process {:dir repo :inherit true}
             "sh" "-c"
             (str "cd hugo && " hugo-cmd
                  " server --buildDrafts --disableFastRender"
                  " --contentDir content-live"
                  " --config hugo.toml,.watch-nonce.toml")))

;; ---------------------------------------------------------------------------
;; autopull mode: poll git, pull when upstream advances, then rebuild.

(def autopull? (some? (System/getenv "AUTOPULL")))

;; Seconds between upstream checks (override with AUTOPULL_INTERVAL).
(def poll-secs
  (or (some-> (System/getenv "AUTOPULL_INTERVAL") str/trim parse-long) 5))

(defn git-out
  "Run a git command, returning trimmed stdout, or nil on non-zero exit."
  [& args]
  (let [{:keys [exit out]} @(apply p/process {:dir repo :out :string :err :string}
                                   "git" args)]
    (when (zero? exit) (str/trim out))))

(defn short-sha [sha] (if sha (subs sha 0 (min 7 (count sha))) "?"))

(defn git-sync!
  "Fetch, and if the upstream branch is ahead, fast-forward and rebuild."
  []
  (git-out "fetch" "--quiet")
  (let [local  (git-out "rev-parse" "HEAD")
        remote (git-out "rev-parse" "@{u}")]
    (cond
      (nil? remote)
      (println "⚠ no upstream configured for the current branch — nothing to pull")

      (and local (not= local remote))
      (do
        (println (format "⇣ upstream advanced (%s → %s) — pulling ..."
                         (short-sha local) (short-sha remote)))
        (let [{:keys [exit]} @(p/process {:dir repo :inherit true}
                                         "git" "pull" "--ff-only")]
          (if (zero? exit)
            (do (build-md!)
                ;; The pull bumped source mtimes; re-baseline so the local
                ;; watcher doesn't rebuild again for the same change.
                (reset! source-baseline (snapshot)))
            (println "✗ git pull failed — see output above")))))))

(defn watch-git []
  (println (format "👀 polling git upstream every %ds — Ctrl-C to stop" poll-secs))
  (loop []
    (Thread/sleep (* 1000 poll-secs))
    (git-sync!)
    (recur)))

;; ---------------------------------------------------------------------------
;; watch mode: rebuild when local .org sources change.

(defn watch-sources []
  (println "👀 watching Org sources — Ctrl-C to stop")
  (reset! source-baseline (snapshot))
  (loop []
    (Thread/sleep 500)
    (let [now (snapshot)]
      (if (= now @source-baseline)
        (recur)
        ;; Change detected — debounce: keep polling until the sources settle
        ;; (no further change for one interval) so a burst of writes triggers a
        ;; single rebuild.
        (let [settled (loop [prev now]
                        (Thread/sleep 500)
                        (let [cur (snapshot)]
                          (if (= cur prev) prev (recur cur))))]
          (reset! source-baseline settled)
          (build-md!)
          (recur))))))

(defn -main []
  (let [hugo (start-hugo)]
    (.addShutdownHook (Runtime/getRuntime)
                      (Thread. #(p/destroy-tree hugo)))
    (if autopull?
      ;; autowatch: watch the local sources AND poll the git upstream at the
      ;; same time. Rebuilds from either are serialized by build-lock.
      (do (doto (Thread. watch-git) (.setDaemon true) (.start))
          (watch-sources))
      (watch-sources))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
