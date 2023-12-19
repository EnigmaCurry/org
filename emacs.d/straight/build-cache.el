
:tanat

"29.1"

#s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data ("straight" ("2023-12-09 23:56:11" ("emacs") (:type git :host github :repo "radian-software/straight.el" :branch "master" :package "straight" :local-repo "straight.el")) "org-elpa" ("2023-12-09 23:56:12" nil (:local-repo nil :package "org-elpa" :type git)) "melpa" ("2023-12-03 17:42:20" nil (:type git :host github :repo "melpa/melpa" :build nil :package "melpa" :local-repo "melpa")) "gnu-elpa-mirror" ("2023-12-03 17:42:20" nil (:type git :host github :repo "emacs-straight/gnu-elpa-mirror" :build nil :package "gnu-elpa-mirror" :local-repo "gnu-elpa-mirror")) "nongnu-elpa" ("2023-12-03 17:42:20" nil (:type git :repo "https://git.savannah.gnu.org/git/emacs/nongnu.git" :depth (full single-branch) :local-repo "nongnu-elpa" :build nil :package "nongnu-elpa")) "el-get" ("2023-12-03 17:42:20" nil (:type git :host github :repo "dimitri/el-get" :build nil :files ("*.el" ("recipes" "recipes/el-get.rcp") "methods" "el-get-pkg.el") :flavor melpa :package "el-get" :local-repo "el-get")) "emacsmirror-mirror" ("2023-12-03 17:42:20" nil (:type git :host github :repo "emacs-straight/emacsmirror-mirror" :build nil :package "emacsmirror-mirror" :local-repo "emacsmirror-mirror")) "use-package" ("2023-12-03 17:42:20" ("emacs" "bind-key") (:type git :flavor melpa :files (:defaults (:exclude "bind-key.el" "bind-chord.el" "use-package-chords.el" "use-package-ensure-system-package.el") "use-package-pkg.el") :host github :repo "jwiegley/use-package" :package "use-package" :local-repo "use-package")) "bind-key" ("2023-12-03 17:42:20" ("emacs") (:flavor melpa :files ("bind-key.el" "bind-key-pkg.el") :package "bind-key" :local-repo "use-package" :type git :repo "jwiegley/use-package" :host github)) "ox-hugo" ("2023-12-03 17:42:20" ("emacs" "tomelr") (:type git :flavor melpa :host github :repo "kaushalmodi/ox-hugo" :package "ox-hugo" :local-repo "ox-hugo")) "tomelr" ("2023-12-03 17:42:20" ("emacs" "map" "seq") (:type git :host github :repo "emacs-straight/tomelr" :files ("*" (:exclude ".git")) :package "tomelr" :local-repo "tomelr")) "map" ("2023-12-03 17:42:20" ("emacs") (:type git :host github :repo "emacs-straight/map" :files ("*" (:exclude ".git")) :package "map" :local-repo "map")) "seq" ("2023-12-03 17:42:20" nil (:type git :host github :repo "emacs-straight/seq" :files ("*" (:exclude ".git")) :package "seq" :local-repo "seq"))))

#s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data ("bind-key" ((bind-key bind-key-autoloads) (autoload 'bind-key "bind-key" "Bind KEY-NAME to COMMAND in KEYMAP (`global-map' if not passed).

KEY-NAME may be a vector, in which case it is passed straight to
`define-key'.  Or it may be a string to be interpreted as
spelled-out keystrokes, e.g., \"C-c C-z\".  See the documentation
of `edmacro-mode' for details.

COMMAND must be an interactive function, lambda form, or a cons
`(STRING . DEFN)'.

KEYMAP, if present, should be a keymap variable or symbol.
For example:

  (bind-key \"M-h\" #\\='some-interactive-function my-mode-map)

  (bind-key \"M-h\" #\\='some-interactive-function \\='my-mode-map)

If PREDICATE is non-nil, it is a form evaluated to determine when
a key should be bound. It must return non-nil in such cases.
Emacs can evaluate this form at any time that it does redisplay
or operates on menu data structures, so you should write it so it
can safely be called at any time.

(fn KEY-NAME COMMAND &optional KEYMAP PREDICATE)" nil t) (autoload 'unbind-key "bind-key" "Unbind the given KEY-NAME, within the KEYMAP (if specified).
See `bind-key' for more details.

(fn KEY-NAME &optional KEYMAP)" nil t) (autoload 'bind-key* "bind-key" "Similar to `bind-key', but overrides any mode-specific bindings.

(fn KEY-NAME COMMAND &optional PREDICATE)" nil t) (autoload 'bind-keys "bind-key" "Bind multiple keys at once.

Accepts keyword arguments:
:map MAP               - a keymap into which the keybindings should be
                         added
:prefix KEY            - prefix key for these bindings
:prefix-map MAP        - name of the prefix map that should be created
                         for these bindings
:prefix-docstring STR  - docstring for the prefix-map variable
:menu-name NAME        - optional menu string for prefix map
:repeat-docstring STR  - docstring for the repeat-map variable
:repeat-map MAP        - name of the repeat map that should be created
                         for these bindings. If specified, the
                         `repeat-map' property of each command bound
                         (within the scope of the `:repeat-map' keyword)
                         is set to this map.
:exit BINDINGS         - Within the scope of `:repeat-map' will bind the
                         key in the repeat map, but will not set the
                         `repeat-map' property of the bound command.
:continue BINDINGS     - Within the scope of `:repeat-map' forces the
                         same behaviour as if no special keyword had
                         been used (that is, the command is bound, and
                         it's `repeat-map' property set)
:filter FORM           - optional form to determine when bindings apply

The rest of the arguments are conses of keybinding string and a
function symbol (unquoted).

(fn &rest ARGS)" nil t) (autoload 'bind-keys* "bind-key" "Bind multiple keys at once, in `override-global-map'.
Accepts the same keyword arguments as `bind-keys' (which see).

This binds keys in such a way that bindings are not overridden by
other modes.  See `override-global-mode'.

(fn &rest ARGS)" nil t) (autoload 'describe-personal-keybindings "bind-key" "Display all the personal keybindings defined by `bind-key'." t) (register-definition-prefixes "bind-key" '("bind-key" "compare-keybindings" "get-binding-description" "override-global-m" "personal-keybindings")) (provide 'bind-key-autoloads)) "use-package" ((use-package-ensure use-package-delight use-package-autoloads use-package-diminish use-package-lint use-package-jump use-package-bind-key use-package-core use-package) (autoload 'use-package-autoload-keymap "use-package-bind-key" "Load PACKAGE and bind key sequence invoking this function to KEYMAP-SYMBOL.
Then simulate pressing the same key sequence a again, so that the
next key pressed is routed to the newly loaded keymap.

This function supports use-package's :bind-keymap keyword.  It
works by binding the given key sequence to an invocation of this
function for a particular keymap.  The keymap is expected to be
defined by the package.  In this way, loading the package is
deferred until the prefix key sequence is pressed.

(fn KEYMAP-SYMBOL PACKAGE OVERRIDE)") (autoload 'use-package-normalize-binder "use-package-bind-key" "

(fn NAME KEYWORD ARGS)") (defalias 'use-package-normalize/:bind 'use-package-normalize-binder) (defalias 'use-package-normalize/:bind* 'use-package-normalize-binder) (defalias 'use-package-autoloads/:bind 'use-package-autoloads-mode) (defalias 'use-package-autoloads/:bind* 'use-package-autoloads-mode) (autoload 'use-package-handler/:bind "use-package-bind-key" "

(fn NAME KEYWORD ARGS REST STATE &optional BIND-MACRO)") (defalias 'use-package-normalize/:bind-keymap 'use-package-normalize-binder) (defalias 'use-package-normalize/:bind-keymap* 'use-package-normalize-binder) (autoload 'use-package-handler/:bind-keymap "use-package-bind-key" "

(fn NAME KEYWORD ARGS REST STATE &optional OVERRIDE)") (autoload 'use-package-handler/:bind-keymap* "use-package-bind-key" "

(fn NAME KEYWORD ARG REST STATE)") (register-definition-prefixes "use-package-bind-key" '("use-package-handler/:bind*")) (autoload 'use-package "use-package-core" "Declare an Emacs package by specifying a group of configuration options.

For the full documentation, see Info node `(use-package) top'.
Usage:

  (use-package package-name
     [:keyword [option]]...)

:init            Code to run before PACKAGE-NAME has been loaded.
:config          Code to run after PACKAGE-NAME has been loaded.  Note that
                 if loading is deferred for any reason, this code does not
                 execute until the lazy load has occurred.
:preface         Code to be run before everything except `:disabled'; this
                 can be used to define functions for use in `:if', or that
                 should be seen by the byte-compiler.

:mode            Form to be added to `auto-mode-alist'.
:magic           Form to be added to `magic-mode-alist'.
:magic-fallback  Form to be added to `magic-fallback-mode-alist'.
:interpreter     Form to be added to `interpreter-mode-alist'.

:commands        Define autoloads for commands that will be defined by the
                 package.  This is useful if the package is being lazily
                 loaded, and you wish to conditionally call functions in your
                 `:init' block that are defined in the package.
:autoload        Similar to :commands, but it for no-interactive one.
:hook            Specify hook(s) to attach this package to.

:bind            Bind keys, and define autoloads for the bound commands.
:bind*           Bind keys, and define autoloads for the bound commands,
                 *overriding all minor mode bindings*.
:bind-keymap     Bind a key prefix to an auto-loaded keymap defined in the
                 package.  This is like `:bind', but for keymaps.
:bind-keymap*    Like `:bind-keymap', but overrides all minor mode bindings

:defer           Defer loading of a package -- this is implied when using
                 `:commands', `:bind', `:bind*', `:mode', `:magic', `:hook',
                 `:magic-fallback', or `:interpreter'.  This can be an integer,
                 to force loading after N seconds of idle time, if the package
                 has not already been loaded.
:demand          Prevent the automatic deferred loading introduced by constructs
                 such as `:bind' (see `:defer' for the complete list).

:after           Delay the effect of the use-package declaration
                 until after the named libraries have loaded.
                 Before they have been loaded, no other keyword
                 has any effect at all, and once they have been
                 loaded it is as if `:after' was not specified.

:if EXPR         Initialize and load only if EXPR evaluates to a non-nil value.
:disabled        The package is ignored completely if this keyword is present.
:defines         Declare certain variables to silence the byte-compiler.
:functions       Declare certain functions to silence the byte-compiler.
:load-path       Add to the `load-path' before attempting to load the package.
:diminish        Support for diminish.el (if installed).
:delight         Support for delight.el (if installed).
:custom          Call `Custom-set' or `set-default' with each variable
                 definition without modifying the Emacs `custom-file'.
                 (compare with `custom-set-variables').
:custom-face     Call `custom-set-faces' with each face definition.
:ensure          Loads the package using package.el if necessary.
:pin             Pin the package to an archive.

(fn NAME &rest ARGS)" nil t) (function-put 'use-package 'lisp-indent-function 'defun) (register-definition-prefixes "use-package-core" '("use-package-")) (autoload 'use-package-normalize/:delight "use-package-delight" "Normalize arguments to delight.

(fn NAME KEYWORD ARGS)") (autoload 'use-package-handler/:delight "use-package-delight" "

(fn NAME KEYWORD ARGS REST STATE)") (register-definition-prefixes "use-package-delight" '("use-package-normalize-delight")) (autoload 'use-package-normalize/:diminish "use-package-diminish" "

(fn NAME KEYWORD ARGS)") (autoload 'use-package-handler/:diminish "use-package-diminish" "

(fn NAME KEYWORD ARG REST STATE)") (register-definition-prefixes "use-package-diminish" '("use-package-normalize-diminish")) (autoload 'use-package-normalize/:ensure "use-package-ensure" "

(fn NAME KEYWORD ARGS)") (autoload 'use-package-handler/:ensure "use-package-ensure" "

(fn NAME KEYWORD ENSURE REST STATE)") (register-definition-prefixes "use-package-ensure" '("use-package-")) (autoload 'use-package-jump-to-package-form "use-package-jump" "Attempt to find and jump to the `use-package' form that loaded PACKAGE.
This will only find the form if that form actually required
PACKAGE.  If PACKAGE was previously required then this function
will jump to the file that originally required PACKAGE instead.

(fn PACKAGE)" t) (register-definition-prefixes "use-package-jump" '("use-package-find-require")) (autoload 'use-package-lint "use-package-lint" "Check for errors in `use-package' declarations.
For example, if the module's `:if' condition is met, but even
with the specified `:load-path' the module cannot be found." t) (register-definition-prefixes "use-package-lint" '("use-package-lint-declaration")) (provide 'use-package-autoloads)) "map" ((map map-autoloads) (register-definition-prefixes "map" '("map-")) (provide 'map-autoloads)) "seq" ((seq seq-autoloads seq-25 seq-24) (register-definition-prefixes "seq-24" '("seq")) (autoload 'seq-subseq "seq-25" "Return the sequence of elements of SEQUENCE from START to END.
END is exclusive.

If END is omitted, it defaults to the length of the sequence.  If
START or END is negative, it counts from the end.  Signal an
error if START or END are outside of the sequence (i.e too large
if positive or too small if negative).

(fn SEQUENCE START &optional END)") (autoload 'seq-take "seq-25" "Return the sequence made of the first N elements of SEQUENCE.
The result is a sequence of the same type as SEQUENCE.

If N is a negative integer or zero, an empty sequence is
returned.

(fn SEQUENCE N)") (autoload 'seq-sort-by "seq-25" "Sort SEQUENCE transformed by FUNCTION using PRED as the comparison function.
Elements of SEQUENCE are transformed by FUNCTION before being
sorted.  FUNCTION must be a function of one argument.

(fn FUNCTION PRED SEQUENCE)") (autoload 'seq-filter "seq-25" "Return a list of all the elements in SEQUENCE for which PRED returns non-nil.

(fn PRED SEQUENCE)") (autoload 'seq-remove "seq-25" "Return a list of all the elements in SEQUENCE for which PRED returns nil.

(fn PRED SEQUENCE)") (autoload 'seq-remove-at-position "seq-25" "Return a copy of SEQUENCE with the element at index N removed.

N is the (zero-based) index of the element that should not be in
the result.

The result is a sequence of the same type as SEQUENCE.

(fn SEQUENCE N)") (autoload 'seq-reduce "seq-25" "Reduce the function FUNCTION across SEQUENCE, starting with INITIAL-VALUE.

Return the result of calling FUNCTION with INITIAL-VALUE and the
first element of SEQUENCE, then calling FUNCTION with that result
and the second element of SEQUENCE, then with that result and the
third element of SEQUENCE, etc.  FUNCTION will be called with
INITIAL-VALUE (and then the accumulated value) as the first
argument, and the elements from SEQUENCE as the second argument.

If SEQUENCE is empty, return INITIAL-VALUE and FUNCTION is not called.

(fn FUNCTION SEQUENCE INITIAL-VALUE)") (autoload 'seq-every-p "seq-25" "Return non-nil if PRED returns non-nil for all the elements of SEQUENCE.

(fn PRED SEQUENCE)") (autoload 'seq-some "seq-25" "Return non-nil if PRED returns non-nil for at least one element of SEQUENCE.
If the value is non-nil, it is the first non-nil value returned by PRED.

(fn PRED SEQUENCE)") (autoload 'seq-find "seq-25" "Return the first element in SEQUENCE for which PRED returns non-nil.
If no such element is found, return DEFAULT.

Note that `seq-find' has an ambiguity if the found element is
identical to DEFAULT, as in that case it is impossible to know
whether an element was found or not.

(fn PRED SEQUENCE &optional DEFAULT)") (autoload 'seq-position "seq-25" "Return the (zero-based) index of the first element in SEQUENCE \"equal\" to ELT.
\"Equality\" is defined by the function TESTFN, which defaults to `equal'.

(fn SEQUENCE ELT &optional TESTFN)") (autoload 'seq-positions "seq-25" "Return list of indices of SEQUENCE elements for which TESTFN returns non-nil.

TESTFN is a two-argument function which is called with each element of
SEQUENCE as the first argument and ELT as the second.
TESTFN defaults to `equal'.

The result is a list of (zero-based) indices.

(fn SEQUENCE ELT &optional TESTFN)") (autoload 'seq-uniq "seq-25" "Return a list of the elements of SEQUENCE with duplicates removed.
TESTFN is used to compare elements, and defaults to `equal'.

(fn SEQUENCE &optional TESTFN)") (autoload 'seq-union "seq-25" "Return a list of all the elements that appear in either SEQUENCE1 or SEQUENCE2.
\"Equality\" of elements is defined by the function TESTFN, which
defaults to `equal'.

(fn SEQUENCE1 SEQUENCE2 &optional TESTFN)") (autoload 'seq-intersection "seq-25" "Return a list of all the elements that appear in both SEQUENCE1 and SEQUENCE2.
\"Equality\" of elements is defined by the function TESTFN, which
defaults to `equal'.

(fn SEQUENCE1 SEQUENCE2 &optional TESTFN)") (autoload 'seq-group-by "seq-25" "Apply FUNCTION to each element of SEQUENCE.
Separate the elements of SEQUENCE into an alist using the results as
keys.  Keys are compared using `equal'.

(fn FUNCTION SEQUENCE)") (autoload 'seq-max "seq-25" "Return the largest element of SEQUENCE.
SEQUENCE must be a sequence of numbers or markers.

(fn SEQUENCE)") (autoload 'seq-random-elt "seq-25" "Return a randomly chosen element from SEQUENCE.
Signal an error if SEQUENCE is empty.

(fn SEQUENCE)") (register-definition-prefixes "seq-25" '("seq-")) (provide 'seq-autoloads)) "tomelr" ((tomelr tomelr-autoloads) (register-definition-prefixes "tomelr" '("tomelr-")) (provide 'tomelr-autoloads)) "ox-hugo" ((ox-blackfriday org-hugo-auto-export-mode ox-hugo-autoloads ox-hugo-deprecated ox-hugo-pandoc-cite ox-hugo) (autoload 'org-hugo-auto-export-mode "org-hugo-auto-export-mode" "Toggle auto exporting the Org file using `ox-hugo'.

This is a minor mode.  If called interactively, toggle the
`Org-Hugo-Auto-Export mode' mode.  If the prefix argument is
positive, enable the mode, and if it is zero or negative, disable
the mode.

If called from Lisp, toggle the mode if ARG is `toggle'.  Enable
the mode if ARG is nil, omitted, or is a positive number.
Disable the mode if ARG is a negative number.

To check whether the minor mode is enabled in the current buffer,
evaluate `org-hugo-auto-export-mode'.

The mode's hook is called both when the mode is enabled and when
it is disabled.

(fn &optional ARG)" t) (register-definition-prefixes "org-hugo-auto-export-mode" '("org-hugo-export-wim-to-md-after-save")) (autoload 'org-blackfriday-export-as-markdown "ox-blackfriday" "Export current buffer to a Github Flavored Markdown buffer.

If narrowing is active in the current buffer, only export its
narrowed part.

If a region is active, export that region.

A non-nil optional argument ASYNC means the process should happen
asynchronously.  The resulting buffer should be accessible
through the `org-export-stack' interface.

When optional argument SUBTREEP is non-nil, export the sub-tree
at point, extracting information from the heading properties
first.

When optional argument VISIBLE-ONLY is non-nil, don't export
contents of hidden elements.

Export is done in a buffer named \"*Org BLACKFRIDAY Export*\", which will
be displayed when `org-export-show-temporary-export-buffer' is
non-nil.

(fn &optional ASYNC SUBTREEP VISIBLE-ONLY)" t) (autoload 'org-blackfriday-convert-region-to-md "ox-blackfriday" "Convert text in the current region to Blackfriday Markdown.
The text is assumed to be in Org mode format.

This can be used in any buffer.  For example, you can write an
itemized list in Org mode syntax in a Markdown buffer and use
this command to convert it." t) (autoload 'org-blackfriday-export-to-markdown "ox-blackfriday" "Export current buffer to a Github Flavored Markdown file.

If narrowing is active in the current buffer, only export its
narrowed part.

If a region is active, export that region.

A non-nil optional argument ASYNC means the process should happen
asynchronously.  The resulting file should be accessible through
the `org-export-stack' interface.

When optional argument SUBTREEP is non-nil, export the sub-tree
at point, extracting information from the heading properties
first.

When optional argument VISIBLE-ONLY is non-nil, don't export
contents of hidden elements.

Return output file's name.

(fn &optional ASYNC SUBTREEP VISIBLE-ONLY)" t) (autoload 'org-blackfriday-publish-to-blackfriday "ox-blackfriday" "Publish an Org file to Blackfriday Markdown file.

PLIST is the property list for the given project.  FILENAME is
the filename of the Org file to be published.  PUB-DIR is the
publishing directory.

Return output file name.

(fn PLIST FILENAME PUB-DIR)") (register-definition-prefixes "ox-blackfriday" '("org-blackfriday-")) (put 'org-hugo-base-dir 'safe-local-variable 'stringp) (put 'org-hugo-goldmark 'safe-local-variable 'booleanp) (put 'org-hugo-section 'safe-local-variable 'stringp) (put 'org-hugo-front-matter-format 'safe-local-variable 'stringp) (put 'org-hugo-footer 'safe-local-variable 'stringp) (put 'org-hugo-preserve-filling 'safe-local-variable 'booleanp) (put 'org-hugo-delete-trailing-ws 'safe-local-variable 'booleanp) (put 'org-hugo-use-code-for-kbd 'safe-local-variable 'booleanp) (put 'org-hugo-allow-spaces-in-tags 'safe-local-variable 'booleanp) (put 'org-hugo-prefer-hyphen-in-tags 'safe-local-variable 'booleanp) (put 'org-hugo-auto-set-lastmod 'safe-local-variable 'booleanp) (put 'org-hugo-suppress-lastmod-period 'safe-local-variable 'floatp) (put 'org-hugo-export-with-toc 'safe-local-variable (lambda (x) (or (booleanp x) (integerp x)))) (put 'org-hugo-export-with-section-numbers 'safe-local-variable (lambda (x) (or (booleanp x) (equal 'onlytoc x) (integerp x)))) (put 'org-hugo-default-static-subdirectory-for-externals 'safe-local-variable 'stringp) (put 'org-hugo-export-creator-string 'safe-local-variable 'stringp) (put 'org-hugo-date-format 'safe-local-variable 'stringp) (put 'org-hugo-paired-shortcodes 'safe-local-variable 'stringp) (put 'org-hugo-link-desc-insert-type 'safe-local-variable 'booleanp) (put 'org-hugo-container-element 'safe-local-variable 'stringp) (autoload 'org-hugo-slug "ox-hugo" "Convert string STR to a `slug' and return that string.

A `slug' is the part of a URL which identifies a particular page
on a website in an easy to read form.

Example: If STR is \"My First Post\", it will be converted to a
slug \"my-first-post\", which can become part of an easy to read
URL like \"https://example.com/posts/my-first-post/\".

In general, STR is a string.  But it can also be a string with
Markdown markup because STR is often a post's sub-heading (which
can contain bold, italics, link, etc markup).

The `slug' generated from that STR follows these rules:

- Contain only lower case alphabet, number and hyphen characters
  ([[:alnum:]-]).
- Not have *any* HTML tag like \"<code>..</code>\",
  \"<span class=..>..</span>\", etc.
- Not contain any URLs (if STR happens to be a Markdown link).
- Replace \".\" in STR with \"dot\", \"&\" with \"and\",
  \"+\" with \"plus\".
- Replace parentheses with double-hyphens.  So \"foo (bar) baz\"
  becomes \"foo--bar--baz\".
- Replace non [[:alnum:]-] chars with spaces, and then one or
  more consecutive spaces with a single hyphen.
- If ALLOW-DOUBLE-HYPHENS is non-nil, at most two consecutive
  hyphens are allowed in the returned string, otherwise consecutive
  hyphens are not returned.
- No hyphens allowed at the leading or trailing end of the slug.

(fn STR &optional ALLOW-DOUBLE-HYPHENS)") (autoload 'org-hugo-export-as-md "ox-hugo" "Export current buffer to a Hugo-compatible Markdown buffer.

If narrowing is active in the current buffer, only export its
narrowed part.

If a region is active, export that region.

A non-nil optional argument ASYNC means the process should happen
asynchronously.  The resulting buffer should be accessible
through the `org-export-stack' interface.

When optional argument SUBTREEP is non-nil, export the sub-tree
at point, extracting information from the heading properties
first.

When optional argument VISIBLE-ONLY is non-nil, don't export
contents of hidden elements.

Export is done in a buffer named \"*Org Hugo Export*\", which
will be displayed when `org-export-show-temporary-export-buffer'
is non-nil.

Return the buffer the export happened to.

(fn &optional ASYNC SUBTREEP VISIBLE-ONLY)" t) (autoload 'org-hugo-export-to-md "ox-hugo" "Export current buffer to a Hugo-compatible Markdown file.

This is the main exporting function which is called by both
`org-hugo--export-file-to-md' and
`org-hugo--export-subtree-to-md', and thus
`org-hugo-export-wim-to-md' too.

If narrowing is active in the current buffer, only export its
narrowed part.

If a region is active, export that region.

A non-nil optional argument ASYNC means the process should happen
asynchronously.  The resulting file should be accessible through
the `org-export-stack' interface.

When optional argument SUBTREEP is non-nil, export the sub-tree
at point, extracting information from the heading properties
first.

When optional argument VISIBLE-ONLY is non-nil, don't export
contents of hidden elements.

Return output file's name.

(fn &optional ASYNC SUBTREEP VISIBLE-ONLY)" t) (autoload 'org-hugo-export-wim-to-md "ox-hugo" "Export the current subtree/all subtrees/current file to a Hugo post.

This is an Export \"What I Mean\" function:

- If the current subtree has the \"EXPORT_FILE_NAME\" property,
  export only that subtree.  Return the return value of
  `org-hugo--export-subtree-to-md'.

- If the current subtree doesn't have that property, but one of
  its parent subtrees has, export from that subtree's scope.
  Return the return value of `org-hugo--export-subtree-to-md'.

- If there are no valid Hugo post subtrees (that have the
  \"EXPORT_FILE_NAME\" property) in the Org buffer the subtrees
  have that property, do file-based
  export (`org-hugo--export-file-to-md'), regardless of the value
  of ALL-SUBTREES.  Return the return value of
  `org-hugo--export-file-to-md'.

- If ALL-SUBTREES is non-nil and the Org buffer has at least 1
  valid Hugo post subtree, export all those valid post subtrees.
  Return a list of output files.

A non-nil optional argument ASYNC means the process should happen
asynchronously.  The resulting file should be accessible through
the `org-export-stack' interface.

When optional argument VISIBLE-ONLY is non-nil, don't export
contents of hidden elements.

The optional argument NOERROR is passed to
`org-hugo--export-file-to-md'.

(fn &optional ALL-SUBTREES ASYNC VISIBLE-ONLY NOERROR)" t) (autoload 'org-hugo-debug-info "ox-hugo" "Get Emacs, Org and Hugo version and ox-hugo customization info.
The information is converted to Markdown format and copied to the
kill ring.  The same information is displayed in the Messages
buffer and returned as a string in Org format." t) (register-definition-prefixes "ox-hugo" '("org-hugo-")) (register-definition-prefixes "ox-hugo-deprecated" '("org-hugo-")) (register-definition-prefixes "ox-hugo-pandoc-cite" '("org-hugo-pandoc-cite-")) (provide 'ox-hugo-autoloads))))

#s(hash-table size 65 test eq rehash-size 1.5 rehash-threshold 0.8125 data (org-elpa #s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data (version 15 "melpa" nil "gnu-elpa-mirror" nil "nongnu-elpa" nil "el-get" nil "emacsmirror-mirror" nil "straight" nil "use-package" nil "bind-key" nil "ox-hugo" nil "tomelr" nil "map" nil "seq" nil)) melpa #s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data (version 2 "gnu-elpa-mirror" nil "nongnu-elpa" nil "el-get" (el-get :type git :flavor melpa :files ("*.el" ("recipes" "recipes/el-get.rcp") "methods" "el-get-pkg.el") :host github :repo "dimitri/el-get") "emacsmirror-mirror" nil "straight" nil "use-package" (use-package :type git :flavor melpa :files (:defaults (:exclude "bind-key.el" "bind-chord.el" "use-package-chords.el" "use-package-ensure-system-package.el") "use-package-pkg.el") :host github :repo "jwiegley/use-package") "bind-key" (bind-key :type git :flavor melpa :files ("bind-key.el" "bind-key-pkg.el") :host github :repo "jwiegley/use-package") "ox-hugo" (ox-hugo :type git :flavor melpa :host github :repo "kaushalmodi/ox-hugo") "tomelr" nil "map" nil "seq" nil)) gnu-elpa-mirror #s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data (version 3 "nongnu-elpa" nil "emacsmirror-mirror" nil "straight" nil "tomelr" (tomelr :type git :host github :repo "emacs-straight/tomelr" :files ("*" (:exclude ".git"))) "map" (map :type git :host github :repo "emacs-straight/map" :files ("*" (:exclude ".git"))) "seq" (seq :type git :host github :repo "emacs-straight/seq" :files ("*" (:exclude ".git"))))) nongnu-elpa #s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data (version 4 "emacsmirror-mirror" nil "straight" nil)) el-get #s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data (version 2 "emacsmirror-mirror" nil "straight" nil)) emacsmirror-mirror #s(hash-table size 65 test equal rehash-size 1.5 rehash-threshold 0.8125 data (version 2 "straight" (straight :type git :host github :repo "emacsmirror/straight")))))

("emacs" "straight" "emacsmirror-mirror" "el-get" "nongnu-elpa" "gnu-elpa-mirror" "melpa" "org-elpa")

t
