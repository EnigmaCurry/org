;; This Emacs config is setup for batch mode only, for building ox-hugo sites.
;; It is not a general purpose emacs config!

(message load-file-name)
(setq user-emacs-directory "/home/ryan/git/vendor/enigmacurry/org/emacs.d")
(defvar bootstrap-version)
(let
  (
    (bootstrap-file
      (expand-file-name
        "straight/repos/straight.el/bootstrap.el"
        user-emacs-directory))
    (bootstrap-version 5))
  (unless (file-exists-p bootstrap-file)
    (with-current-buffer
      (url-retrieve-synchronously
        "https://raw.githubusercontent.com/raxod502/straight.el/develop/install.el"
        'silent
        'inhibit-cookies)
      (goto-char (point-max))
      (eval-print-last-sexp)))
  (load bootstrap-file nil 'nomessage))

;; Use-package for all dependencies :: https://github.com/jwiegley/use-package
(straight-use-package 'use-package)
;; Make use-package use straight.el by default:
(setq straight-use-package-by-default t)

(use-package ox-hugo
  :ensure t)

(defun build (org-file)
  (find-file org-file)
  (org-hugo-export-wim-to-md :all-subtrees nil nil :noerror)
  )

;; Run this occasionally, to lock new package versions:
;;(straight-freeze-versions)

