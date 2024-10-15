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
  (setq org-hugo-special-block-type-properties
        '(("audio" :raw t)
          ("katex" :raw t)
          ("mark" :trim-pre t :trim-post t)
          ("tikzjax" :raw t)
          ("video" :raw t)
          ("run" :raw t)
          ("stdout" :raw t)
          ("edit" :raw t)
          ("env" :raw t)
          ("math" :raw t))))

(message "Loading f.el library")
(use-package f)

(defun build-books (root-dir)
  "Build all org books into hugo markdown"
  (message "Starting build process for %s" root-dir)
  (let ((org-files (append
                    (directory-files root-dir "\\.org$")
                    (directory-files (f-join root-dir "books") t "\\.org$"))))
    (dolist (e org-files)
      (message "Processing file: %s" e)
      (find-file e)
      (org-babel-do-load-languages
       'org-babel-load-languages
       '((ditaa . t)))
      (org-babel-execute-buffer)
      (org-hugo-export-wim-to-md :all-subtrees nil nil :noerror)))
  (message "Build process complete"))

(defun build (root-dir)
  
  (build-books root-dir)
  )

;; Configure org-babel languages
(org-babel-do-load-languages
 'org-babel-load-languages
 '((ditaa . t)))
(defun my/org-babel-execute:ditaa (body params)
  "Execute BODY of Ditaa code with org-babel according to PARAMS using a custom Java command."
  (let* ((out-file (or (cdr (assq :file params))
                       (error "Ditaa code block requires :file header argument")))
         (cmdline (cdr (assq :cmdline params)))
         (java (cdr (assq :java params)))
         (in-file (org-babel-temp-file "ditaa-"))
         (eps (cdr (assq :eps params)))
         (eps-file (when eps
                     (org-babel-process-file-name (concat in-file ".eps"))))
         (cmd (concat "java -cp /usr/share/java/commons-cli.jar:/usr/share/java/ditaa.jar "
                      "org.stathissideris.ascii2image.core.CommandLineConverter "
                      cmdline " "
                      (org-babel-process-file-name in-file) " "
                      (org-babel-process-file-name out-file))))
    (with-temp-file in-file (insert body))
    (message cmd) (shell-command cmd)
    nil)) ;; signal that output has already been written to file
(advice-add 'org-babel-execute:ditaa :override #'my/org-babel-execute:ditaa)

(message "init.el loading complete")
