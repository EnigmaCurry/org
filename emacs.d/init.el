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
          ("math" :raw t)))
  )

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
