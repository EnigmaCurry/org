;; This Emacs config is setup for batch mode only, for building ox-hugo sites.
;; It is not a general purpose emacs config!

(message "Loading init.el from %s" load-file-name)

(message "Setting user-emacs-directory")
(setq user-emacs-directory "~/git/vendor/enigmacurry/org/emacs.d")

(setq straight-recipe-overrides
      '((nil . ((nongnu-elpa :type git :host github :repo "EnigmaCurry/nongnu-elpa")))))

(defvar bootstrap-version)

;; Function to print the *straight-process* buffer if it exists
(defun print-straight-process-buffer ()
  "Print the contents of the *straight-process* buffer to stderr if it exists."
  (let ((buffer (get-buffer "*straight-process*")))
    (when buffer
      (with-current-buffer buffer
        (princ (buffer-string) #'external-debugging-output)))))

(message "Starting bootstrap process")
(let
    (
     (bootstrap-file
      (expand-file-name
       "straight/repos/straight.el/bootstrap.el"
       user-emacs-directory))
     (bootstrap-version 5))
  (condition-case err
      (progn
        (unless (file-exists-p bootstrap-file)
          (with-current-buffer
              (url-retrieve-synchronously
               "https://raw.githubusercontent.com/raxod502/straight.el/develop/install.el"
               'silent
               'inhibit-cookies)
            (goto-char (point-max))
            (eval-print-last-sexp)))
        (load bootstrap-file nil 'nomessage))
    (error
     (message "Error during bootstrap process: %s" err)
     (print-straight-process-buffer)
     (kill-emacs 1))))
(message "Bootstrap process complete")

;; Use-package for all dependencies :: https://github.com/jwiegley/use-package
(message "Installing use-package")
(straight-use-package 'use-package)
(setq straight-use-package-by-default t)
(message "use-package installed and configured")

(message "Configuring ox-hugo")
(use-package ox-hugo
  :after org
  :config
  (setq org-directory default-directory)
  (setenv "ORG_DIR" org-directory)
  (setenv "OX_HUGO_STATIC" (concat org-directory "/hugo/static"))
  (setq org-hugo-special-block-type-properties
        '(("audio" :raw t)
          ("katex" :raw t)
          ("mark" :trim-pre t :trim-post t)
          ("tikzjax" :raw t)
          ("video" :raw t)
          ("run" :raw t)
          ("stdout" :raw t)
          ("html" :raw t)
          ("mermaid" :raw t)
          ("edit" :raw t)
          ("env" :raw t)
          ("math" :raw t)
          ("shader" :raw t)))

  ;; Make `run'/`stdout' blocks robust for arbitrary embedded scripts.
  ;; These render as <pre> via a paired Hugo shortcode, but Org otherwise
  ;; parses their bodies as markup -- so shell syntax like `[[ -f x ]]' or
  ;; awk `[[:space:]]' is misread as an Org [[link]] and aborts the export
  ;; ("Unable to resolve link"). Rewrite them into verbatim
  ;; `#+begin_export hugo' blocks (which Org never parses for markup)
  ;; emitting the same shortcode, before ox-hugo parses the buffer.
  (defvar my/verbatim-special-blocks '("run" "shader")
    "Special-block types whose bodies must be emitted verbatim.")

  (defun my/rawify-verbatim-special-blocks (&rest _)
    "Rewrite `my/verbatim-special-blocks' special blocks in the current
buffer into verbatim Hugo export blocks emitting the matching paired
shortcode. Parsing is used to locate blocks, so any such markers shown
inside example/src blocks are left untouched."
    (let ((blocks '()))
      (org-element-map (org-element-parse-buffer) 'special-block
        (lambda (sb)
          (when (member (org-element-property :type sb) my/verbatim-special-blocks)
            (push sb blocks))))
      ;; `blocks' is in reverse document order; editing back-to-front keeps
      ;; the remaining buffer positions valid.
      (dolist (sb blocks)
        (let* ((type (org-element-property :type sb))
               (beg (org-element-property :begin sb))
               (end (org-element-property :end sb))
               (cbeg (org-element-property :contents-begin sb))
               (cend (org-element-property :contents-end sb))
               (post-blank (or (org-element-property :post-blank sb) 0))
               (body (if (and cbeg cend)
                         (buffer-substring-no-properties cbeg cend)
                       ""))
               ;; Trim surrounding blank lines only; keep each line's indentation.
               (body (replace-regexp-in-string "\\`[\n\r]+\\|[ \t\n\r]+\\'" "" body))
               ;; Preserve #+attr_shortcode: args exactly as ox-hugo would
               ;; (named ":style x :title y" -> style="x" title="y", or
               ;; positional args passed through verbatim).
               (attr-sc (org-export-read-attribute :attr_shortcode sb))
               (pos-args (and (null attr-sc)
                              (org-string-nw-p
                               (mapconcat #'identity
                                          (org-element-property :attr_shortcode sb) " "))))
               (named-args (unless pos-args
                             (org-string-nw-p (org-html--make-attribute-string attr-sc))))
               (sc-args (or pos-args named-args))
               (sc-args (if sc-args (concat " " sc-args " ") " ")))
          (delete-region beg end)
          (goto-char beg)
          (insert (format "#+begin_export hugo\n{{<%s%s>}}\n%s\n{{< /%s >}}\n#+end_export\n"
                          (concat " " type) sc-args body type))
          (insert (make-string post-blank ?\n))))))

  ;; `diff' blocks: render the changeset between two *named* blocks as a
  ;; toggleable widget (Diff <-> Source views), keeping the source DRY (only the
  ;; named blocks hold it). Author it as:
  ;;
  ;;   #+NAME: base
  ;;   #+begin_src LANG ... #+end_src      ;; or #+begin_shader / #+begin_example
  ;;
  ;;   #+NAME: evolved
  ;;   #+begin_src LANG ... #+end_src
  ;;
  ;;   #+attr_diff: :from base :to evolved :context 3 :view diff
  ;;   #+begin_diff
  ;;   #+end_diff
  ;;
  ;; Or reference a single block and diff it against an inline change written in
  ;; the block's own body (the body becomes the other side; :label names it,
  ;; default "edited"):
  ;;
  ;;   #+attr_diff: :from base :label patched
  ;;   #+begin_diff
  ;;   ...the modified source...
  ;;   #+end_diff
  ;;
  ;; Before ox-hugo parses, the block is replaced with a `diffbox' Hugo shortcode
  ;; carrying both a unified diff (highlighted as `diff') and the full source of
  ;; the `:to' block (highlighted in its own language). The box statically shows
  ;; the `:view' (default `diff'; set `:view source' to flip it) so it renders
  ;; without JS; with JS a button toggles between the two. Both referenced blocks
  ;; must exist anywhere in the same file (any subtree), else the build fails.
  (defun my/named-block (name)
    "Return a plist (:body STRING :lang STRING) for the named src/example/special
block NAME, or nil when no such named block exists in the buffer. :lang is the
block's source language (\"glsl\" for `shader' special blocks, the src-block
language otherwise, else \"text\"), used to highlight the source view."
    (let (result)
      (org-element-map (org-element-parse-buffer)
          '(src-block example-block special-block)
        (lambda (el)
          (when (equal (org-element-property :name el) name)
            (setq result
                  (pcase (org-element-type el)
                    ('src-block
                     (list :body (or (org-element-property :value el) "")
                           :lang (or (org-element-property :language el) "text")))
                    ('example-block
                     (list :body (or (org-element-property :value el) "")
                           :lang "text"))
                    ('special-block
                     (let ((type (org-element-property :type el))
                           (cbeg (org-element-property :contents-begin el))
                           (cend (org-element-property :contents-end el)))
                       (list :body (if (and cbeg cend)
                                       (buffer-substring-no-properties cbeg cend)
                                     "")
                             :lang (if (equal type "shader") "glsl" "text"))))))))
        nil t)
      (when result
        (plist-put result :body
                   (replace-regexp-in-string
                    "\\`[\n\r]+\\|[ \t\n\r]+\\'" "" (plist-get result :body))))))

  (defun my/unified-diff (from-name from-body to-name to-body context)
    "Return a unified diff string from FROM-BODY to TO-BODY, labelled with
FROM-NAME/TO-NAME and CONTEXT lines of surrounding context."
    (let ((from-file (make-temp-file "org-diff-from-"))
          (to-file (make-temp-file "org-diff-to-")))
      (unwind-protect
          (progn
            (with-temp-file from-file
              (insert from-body) (unless (bolp) (insert "\n")))
            (with-temp-file to-file
              (insert to-body) (unless (bolp) (insert "\n")))
            (with-temp-buffer
              (let ((status (call-process
                             "diff" nil t nil
                             (format "-U%d" context)
                             "--label" from-name "--label" to-name
                             from-file to-file)))
                ;; diff exit codes: 0 = identical, 1 = differences, >1 = trouble.
                (when (> status 1)
                  (error "diff exited %d while diffing %S -> %S"
                         status from-name to-name))
                (buffer-string))))
        (delete-file from-file)
        (delete-file to-file))))

  (defun my/diff-side (name role)
    "Resolve named block NAME to a (NAME BODY LANG) side, erroring if absent.
ROLE names the slot (\":from\"/\":to\") for the error message."
    (let ((blk (my/named-block name)))
      (unless blk
        (error "diff block: no block named %S found to diff %s" name role))
      (list name (plist-get blk :body) (plist-get blk :lang))))

  (defun my/expand-diff-blocks (&rest _)
    "Replace every `#+begin_diff' special block with a `diffbox' shortcode.

The two sides of the diff are given via `#+attr_diff:', two ways:
  - :from NAME :to NAME  -- diff two named blocks (the block body must be empty).
  - :from NAME           -- diff a named block against this block's own BODY
    (or :to NAME)            (an inline change); :label names the inline side
                             (default \"edited\"). With :from the body is the new
                             side; with :to it is the original side.
Also accepts [:context N] [:view diff|source] [:lang LANG]. Signals an error
(failing the build) when the references are missing/ambiguous or a named block
cannot be found."
    (let ((blocks '()))
      (org-element-map (org-element-parse-buffer) 'special-block
        (lambda (sb)
          (when (equal (org-element-property :type sb) "diff")
            (push sb blocks))))
      ;; `blocks' is in reverse document order; editing back-to-front keeps the
      ;; remaining buffer positions valid.
      (dolist (sb blocks)
        (let* ((beg (org-element-property :begin sb))
               (end (org-element-property :end sb))
               (cbeg (org-element-property :contents-begin sb))
               (cend (org-element-property :contents-end sb))
               (post-blank (or (org-element-property :post-blank sb) 0))
               (attr (org-export-read-attribute :attr_diff sb))
               (from (plist-get attr :from))
               (to (plist-get attr :to))
               (label (or (plist-get attr :label) "edited"))
               (view (if (equal (plist-get attr :view) "source") "source" "diff"))
               (lang-override (plist-get attr :lang))
               (context (let ((c (plist-get attr :context)))
                          (if c (string-to-number (format "%s" c)) 3)))
               ;; the block's own body (raw, trimmed) is an optional inline side
               (body (and cbeg cend
                          (org-string-nw-p
                           (replace-regexp-in-string
                            "\\`[\n\r]+\\|[ \t\n\r]+\\'" ""
                            (buffer-substring-no-properties cbeg cend)))))
               from-side to-side)
          (cond
           ;; two named blocks, no inline body
           ((and from to)
            (when body
              (error "diff block: two named blocks given (:from %S :to %S); remove the inline body"
                     from to))
            (setq from-side (my/diff-side from ":from")
                  to-side (my/diff-side to ":to")))
           ;; one named block + the inline body as the other side
           (body
            (cond
             (from (setq from-side (my/diff-side from ":from")
                         to-side (list label body (nth 2 from-side))))
             (to (setq to-side (my/diff-side to ":to")
                       from-side (list label body (nth 2 to-side))))
             (t (error "diff block: an inline body needs :from or :to naming the base block"))))
           (t (error "diff block: need :from and :to, or one ref with an inline body (got :from %S :to %S, body %s)"
                     from to (if body "present" "empty"))))
          (let* ((from-name (nth 0 from-side)) (from-body (nth 1 from-side))
                 (to-name (nth 0 to-side)) (to-body (nth 1 to-side))
                 (lang (or lang-override (nth 2 to-side) (nth 2 from-side)))
                 (diff (my/unified-diff from-name from-body to-name to-body context)))
            (delete-region beg end)
            (goto-char beg)
            ;; Emit a verbatim shortcode carrying three parts -- the unified diff,
            ;; the original source, and the evolved source -- separated by an
            ;; HTML-comment sentinel the shortcode splits on. The shortcode
            ;; highlights all three so JS can assemble a GitHub-style diff with
            ;; per-line syntax colors. (Avoid a literal `{{<' inside the diffed
            ;; code -- it would start a shortcode.)
            (insert (format (concat "#+begin_export hugo\n"
                                    "{{< diffbox from=%S to=%S lang=%S view=%S >}}\n"
                                    "%s<!--diffbox-sep-->\n%s\n<!--diffbox-sep-->\n%s\n"
                                    "{{< /diffbox >}}\n#+end_export\n")
                            from-name to-name lang view diff from-body to-body))
            (insert (make-string post-blank ?\n)))))))

  (defun my/preprocess-org-buffer (&rest _)
    "Buffer rewrites that must run before ox-hugo parses: expand `diff' blocks
while their referenced named blocks still exist, then rawify verbatim blocks."
    (my/expand-diff-blocks)
    (my/rawify-verbatim-special-blocks))

  (advice-add 'org-hugo-export-wim-to-md :before #'my/preprocess-org-buffer))

(message "Loading f.el library")
(use-package f)

(defun build (paths)
  "Build Org files and/or directories into Hugo markdown.
`paths` should be a list of file paths or directories."
  (message "Starting build process for: %s" paths)
  (let ((org-files '()))
    ;; Collect Org files from paths
    (dolist (path paths)
      (if (file-directory-p path)
          (setq org-files (append org-files (directory-files-recursively path "\\.org$")))
        (when (and (file-regular-p path) (string-match "\\.org$" path))
          (push path org-files))))
    ;; Process Org files
    (dolist (e org-files)
      (message "Building Org file: %s" e)
      (with-current-buffer (find-file-noselect e)
        (org-hugo-export-wim-to-md :all-subtrees nil nil :noerror)))
    (message "Build process complete for: %s" paths)))

(message "init.el loading complete")
