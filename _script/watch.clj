#!/usr/bin/env bb
;; Dev watch loop: serve Hugo with live-reload while re-exporting Org -> Markdown
;; whenever the sources change.
;;
;; Two modes (selected by the AUTOPULL env var, set by `make autowatch`):
;;
;;   make watch     - LOCAL editing. Re-export when the local .org sources change,
;;                    detected by polling their mtimes.
;;
;;   make autowatch - REMOTE sync. Poll git; when the upstream branch advances,
;;                    `git pull --ff-only` and THEN re-export. The pull and the
;;                    rebuild run in one sequence, so the export always reads the
;;                    freshly-pulled files and fires exactly once per new commit.
;;                    (The old design spawned a separate `git autopull` and let an
;;                    mtime watcher guess when it finished — a race that exported
;;                    stale sources, the cause of "reloads but never updates".)
;;
;; Hugo's own server watches everything under hugo/ and live-reloads the browser;
;; this script only regenerates hugo/content/ from the .org sources, which Hugo
;; then picks up on its own.

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

(defn build-md! []
  (println "↻ re-exporting Markdown ...")
  (let [{:keys [exit]} @(p/process {:dir repo :inherit true} "make" "build-md")]
    (println (if (zero? exit)
               "✓ Markdown rebuilt — Hugo will live-reload"
               "✗ make build-md failed — see output above"))))

(def hugo-cmd (or (System/getenv "HUGO") "hugo"))

(defn start-hugo []
  (println "▶ starting Hugo server (http://localhost:1313) ...")
  (p/process {:dir repo :inherit true}
             "sh" "-c"
             (str "cd hugo && " hugo-cmd " server --buildDrafts --disableFastRender")))

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
            (build-md!)
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
  (loop [baseline (snapshot)]
    (Thread/sleep 500)
    (let [now (snapshot)]
      (if (= now baseline)
        (recur baseline)
        ;; Change detected — debounce: keep polling until the sources settle
        ;; (no further change for one interval) so a burst of writes triggers a
        ;; single rebuild.
        (let [settled (loop [prev now]
                        (Thread/sleep 500)
                        (let [cur (snapshot)]
                          (if (= cur prev) prev (recur cur))))]
          (build-md!)
          (recur settled))))))

(defn -main []
  (let [hugo (start-hugo)]
    (.addShutdownHook (Runtime/getRuntime)
                      (Thread. #(p/destroy-tree hugo)))
    (if autopull?
      (watch-git)
      (watch-sources))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
