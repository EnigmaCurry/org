#!/usr/bin/env python3
"""Check that copy-pasteable code blocks survive the Org -> Hugo pipeline intact.

Two classes of bug have shipped here, neither visible in the Org source
and both only visible in the rendered page:

 1. Corruption. Declaring a shortcode as %name makes ox-hugo emit
    {{% name %}}, whose inner text Hugo runs through the Markdown
    typographer. That rewrites shell quotes to &ldquo;/&rdquo; and
    injects a stray <p> inside the <pre>, so copying the line fails
    in a shell.

 2. Silent loss. If a block type is missing from
    `my/verbatim-special-blocks' in emacs.d/init.el, Org parses its
    body as markup -- and a line whose first non-whitespace character
    is '#' is an Org comment, so it is dropped without a warning.
    This ate config-file and shell comments across several books
    before anyone noticed.

Check 2 below catches that by comparing every verbatim source line
against the rendered pages, which is more robust than linting the
source: it holds whatever the cause of the loss turns out to be.

Run it against a built site:  make check

Exit status is non-zero if any check fails.
"""

import html
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PUBLIC = REPO / "public"

# Blocks whose contents a reader is expected to copy and run verbatim.
# Keep in sync with `my/verbatim-special-blocks' in emacs.d/init.el.
# (shader is excluded: it renders to a canvas, not a <pre>.)
VERBATIM_BLOCKS = ("run", "stdout", "env", "edit")

# Things that must never appear inside a rendered <pre>.
CORRUPTION = {
    "&ldquo;": "left curly double quote (typographer ran on the block)",
    "&rdquo;": "right curly double quote (typographer ran on the block)",
    "&lsquo;": "left curly single quote (typographer ran on the block)",
    "&rsquo;": "right curly single quote (typographer ran on the block)",
    "<p>": "stray paragraph tag (block was rendered as Markdown)",
}

PRE = re.compile(r"<pre>(.*?)</pre>", re.S)
BEGIN = re.compile(r"^\s*#\+begin_(\w+)", re.I)
END = re.compile(r"^\s*#\+end_(\w+)", re.I)


def org_sources():
    # Emacs leaves ".#name.org" lock symlinks while a buffer is being
    # edited, pointing at "user@host.pid", which is not a file. They come
    # and go under us, so a run would fail on whichever buffer happened
    # to be open rather than on anything wrong with the book.
    def real(paths):
        return [p for p in sorted(paths) if not p.name.startswith(".#") and p.is_file()]

    yield from real(REPO.glob("*.org"))
    yield from real((REPO / "books").glob("*.org"))


HEADING = re.compile(r"^(\*+)\s")
DRAFT = re.compile(r"^\s*:EXPORT_HUGO_DRAFT:\s*true\s*$", re.I)


def verbatim_lines(path, skip_drafts=False):
    """Yield (lineno, text) for every line inside a copy-pasteable block.

    Draft subtrees are never rendered by Hugo, so lines inside them cannot
    be compared against the built site. Draft status is inherited by
    child headings.
    """
    block = None
    stack = []  # (heading level, is_draft)
    pending = None  # heading level awaiting its property drawer
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if m := HEADING.match(line):
            level = len(m.group(1))
            while stack and stack[-1][0] >= level:
                stack.pop()
            inherited = bool(stack and stack[-1][1])
            stack.append([level, inherited])
            pending = stack[-1]
            block = None
            continue
        if pending is not None:
            if DRAFT.match(line):
                pending[1] = True
            elif line.strip() == ":END:":
                pending = None

        if m := BEGIN.match(line):
            block = m.group(1).lower()
        elif END.match(line):
            block = None
        elif block in VERBATIM_BLOCKS:
            if skip_drafts and stack and stack[-1][1]:
                continue
            yield n, line


def check_block_balance():
    """3. Every #+begin_X has a matching #+end_X, in order."""
    bad = []
    for src in org_sources():
        stack = []
        for n, line in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
            if m := BEGIN.match(line):
                stack.append((m.group(1).lower(), n))
            elif m := END.match(line):
                kind = m.group(1).lower()
                if not stack:
                    bad.append((rel(src), n, f"#+end_{kind} with no matching begin"))
                elif stack[-1][0] != kind:
                    open_kind, open_n = stack.pop()
                    bad.append((rel(src), n,
                                f"#+end_{kind} closes #+begin_{open_kind} from line {open_n}"))
                else:
                    stack.pop()
        for kind, n in stack:
            bad.append((rel(src), n, f"#+begin_{kind} is never closed"))
    for path, n, why in bad:
        print(f"  {path}:{n}: {why}")
    return not bad


def rendered_pre_blocks():
    """Yield (path, unescaped_text, raw_html) for every <pre> on the site."""
    for f in sorted(PUBLIC.rglob("*.html")):
        text = f.read_text(encoding="utf-8", errors="replace")
        for m in PRE.finditer(text):
            yield f, html.unescape(m.group(1)), m.group(1)


def normalize(line):
    """Compare source and rendered text on equal footing.

    A source line may itself contain HTML entities (`&lt;zone&gt;`) that are
    meant to display as markup, so unescape both sides until stable rather
    than once, and ignore trailing whitespace, which the renderer strips.
    """
    for _ in range(3):
        nxt = html.unescape(line)
        if nxt == line:
            break
        line = nxt
    return line.rstrip()


def rel(p):
    return p.relative_to(REPO)


def check_rendered_clean(pres):
    """1. No typographer damage or stray markup inside a code block."""
    bad = []
    for path, _, raw in pres:
        for needle, why in CORRUPTION.items():
            if needle in raw:
                bad.append((rel(path), needle, why))
    for path, needle, why in bad:
        print(f"  {path}: contains {needle} -- {why}")
    return not bad


def check_nothing_dropped(pres):
    """2. Every verbatim source line reaches some rendered code block."""
    present = {
        normalize(l)
        for _, text, _ in pres
        for l in text.splitlines()
    }
    bad = []
    for src in org_sources():
        for n, line in verbatim_lines(src, skip_drafts=True):
            if line.strip() and normalize(line) not in present:
                bad.append((rel(src), n, line.strip()))
    for path, n, line in bad:
        print(f"  {path}:{n}: never reaches any rendered page: {line}")
    return not bad


def main():
    if not PUBLIC.is_dir():
        print(f"no built site at {rel(PUBLIC)} -- run `make build` first")
        return 1

    pres = list(rendered_pre_blocks())
    checks = [
        ("rendered code blocks are clean", lambda: check_rendered_clean(pres)),
        ("no verbatim line silently dropped", lambda: check_nothing_dropped(pres)),
        ("every block is closed", check_block_balance),
    ]

    failed = 0
    for name, run in checks:
        if run():
            print(f"ok   {name}")
        else:
            print(f"FAIL {name}")
            failed += 1

    print(f"\n{len(pres)} code blocks checked")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
