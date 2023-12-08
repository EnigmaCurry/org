MAKE_ := $(MAKE) -j1 --no-print-directory
LIB ?= emacs.d/init.el

.PHONY: build # Export notes.org to separate markdown files and build hugo site
build: build-md build-hugo

.PHONY: help # Show this help screen
help:
	@grep -h '^.PHONY: .* #' Makefile | sed 's/\.PHONY: \(.*\) # \(.*\)/make \1 \t- \2/' | expand -t20

emacs-batch:
	@emacs -batch --eval "(progn\
	(load-file \"${LIB}\")\
    (${FUNC} ${ARGS})\
	)"

.PHONY: install
install:
	git submodule update --init --recursive

build-md:
	@${MAKE_} emacs-batch FUNC=build ARGS='\"notes.org\"'

build-hugo:
	@cd hugo && hugo

.PHONY: serve
serve: build
	@cd hugo && hugo server --buildDrafts --disableFastRender

.PHONY: serve-prod
serve-prod: build
	@cd hugo && hugo server --navigateToChanged

.PHONY: clean
clean:
	rm -rf hugo/content public
