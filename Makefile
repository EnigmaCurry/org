MAKE_ := $(MAKE) -j1 --no-print-directory
LIB ?= emacs.d/init.el

PUBLISH_RCLONE_REMOTE ?= book_preview
PUBLISH_RCLONE_DIRECTORY ?= book_preview

RELEARN_THEME_SNAPSHOT ?= 974798afca08ff5f9768a0a7d575a71399ce7148
RELEARN_THEME_TARBALL_URL_PREFIX ?= https://codeload.github.com/McShelby/hugo-theme-relearn/tar.gz/

.PHONY: build # Export notes.org to separate markdown files and build hugo site
build: clean build-md build-hugo

.PHONY: help # Show this help screen
help:
	@grep -h '^.PHONY: .* #' Makefile | sed 's/\.PHONY: \(.*\) # \(.*\)/make \1 \t- \2/' | expand -t20

emacs-batch:
	@emacs -batch --eval "(progn\
	(load-file \"${LIB}\")\
    (${FUNC} ${ARGS})\
	)"

.PHONY: install # Install the hugo theme
install:
	@test -d hugo/themes/relearn || (TMPDIR=$$(mktemp -d) && wget -O $${TMPDIR}/relearn-theme.tar.gz ${RELEARN_THEME_TARBALL_URL_PREFIX}${RELEARN_THEME_SNAPSHOT} && tar xfv $${TMPDIR}/relearn-theme.tar.gz -C hugo/themes && rm -rf $${TMPDIR} && mv hugo/themes/hugo-theme-relearn-${RELEARN_THEME_SNAPSHOT} hugo/themes/relearn)

build-md:
	PWD=$$(pwd) ${MAKE_} emacs-batch FUNC=build ARGS='\"$${PWD}\"'

build-hugo:
	@cd hugo && hugo

.PHONY: serve # Build and serve the site on http://localhost:1313
serve: build
	@cd hugo && xdg-open http://localhost:1313 && hugo server --buildDrafts --disableFastRender

.PHONY: serve-prod
serve-prod: build
	@cd hugo && hugo && hugo server --navigateToChanged

.PHONY: clean
clean:
	rm -rf hugo/content public

.PHONY: publish # Publish changes to rclone remote
publish: build
	@rclone listremotes | grep "^${PUBLISH_RCLONE_REMOTE}:$$" || (echo -e "Missing rclone remote: ${PUBLISH_RCLONE_REMOTE} \nPlease run 'rclone config' and create this remote." && false)
	@echo "## Publishing books via rclone ... be patient ..."
	time -p rclone sync public ${PUBLISH_RCLONE_REMOTE}:${PUBLISH_RCLONE_DIRECTORY}/public
	@echo Done
