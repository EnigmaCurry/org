#!/usr/bin/env bb
;; Dev watch loop: serve Hugo with live-reload while re-exporting Org -> Markdown
;; whenever the Org sources change (e.g. `git autopull` syncing the remote).
;;
;; Hugo's own server already watches everything under hugo/ (generated content,
;; theme, shortcodes) and live-reloads the browser. This script fills the only
;; gap: regenerating hugo/content/ from the .org sources via `make build-md`,
;; which Hugo then picks up on its own.

(require '[babashka.fs :as fs]
         '[babashka.process :as p])

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
  (println "↻ Org changed — re-exporting Markdown ...")
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

;; When AUTOPULL is set (via `make autowatch`), also run `git autopull` in the
;; same terminal so one command both syncs the remote and serves with reload.
(def autopull? (some? (System/getenv "AUTOPULL")))

(defn start-autopull []
  (println "▶ starting `git autopull` ...")
  (p/process {:dir repo :inherit true} "git" "autopull"))

(defn -main []
  (let [hugo (start-hugo)
        autopull (when autopull? (start-autopull))
        procs (remove nil? [hugo autopull])]
    (.addShutdownHook (Runtime/getRuntime)
                      (Thread. #(run! p/destroy-tree procs)))
    (println "👀 watching Org sources — Ctrl-C to stop")
    (loop [baseline (snapshot)]
    (Thread/sleep 500)
    (let [now (snapshot)]
      (if (= now baseline)
        (recur baseline)
        ;; Change detected — debounce: keep polling until the sources settle
        ;; (no further change for one interval) so a burst of writes, like an
        ;; autopull touching many files, triggers a single rebuild.
        (let [settled (loop [prev now]
                        (Thread/sleep 500)
                        (let [cur (snapshot)]
                          (if (= cur prev) prev (recur cur))))]
          (build-md!)
          (recur settled)))))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
