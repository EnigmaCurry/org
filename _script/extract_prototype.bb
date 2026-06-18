#!/usr/bin/env bb
;; Extract the prototype's <style> and main <script> blocks into the
;; terminal theme's asset files. The head pre-paint <script> stays inline
;; in head.html, so it is intentionally not extracted here.
(require '[clojure.string :as str])

(def src   (slurp "prototype/terminal.html"))
(def css-out "hugo/themes/terminal/assets/css/terminal.css")
(def js-out  "hugo/themes/terminal/assets/js/terminal.js")

(defn between [s open close from]
  (let [i (str/index-of s open from)
        a (+ i (count open))
        b (str/index-of s close a)]
    [(subs s a b) b]))

;; the single <style>...</style> block
(let [[css _] (between src "<style>" "</style>" 0)]
  (spit css-out (str (str/trim css) "\n"))
  (println "wrote" css-out (count css) "chars"))

;; the LAST <script>...</script> (the big behavior block at end of file)
(let [last-open (str/last-index-of src "<script>")
      [js _] (between src "<script>" "</script>" last-open)]
  (spit js-out (str (str/trim js) "\n"))
  (println "wrote" js-out (count js) "chars"))
