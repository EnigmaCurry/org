((org-mode
  (eval . (progn
            (defun my-org-babel-execute-and-save ()
              "Evaluate all Babel code blocks, save buffer, and leave it unmodified."
              (remove-hook 'before-save-hook #'my-org-babel-execute-and-save 'local)
              (unwind-protect
                  (progn
                    ;; Execute all Babel code blocks
                    (org-babel-execute-buffer)
                    ;; Save the buffer
                    (save-buffer)
                    ;; Ensure buffer is marked as unmodified
                    ;; TODO: this doesn't work.
                    (set-buffer-modified-p nil))
                ;; Re-enable the hook
                (add-hook 'before-save-hook #'my-org-babel-execute-and-save nil 'local)))

            ;; Add the hook to execute Babel blocks before saving
            (add-hook 'before-save-hook #'my-org-babel-execute-and-save nil 'local)))
  (eval . (org-hugo-auto-export-mode))
  (org-confirm-babel-evaluate . nil)))
