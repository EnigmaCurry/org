set export
current_dir := `pwd`

# Default recipe to forward commands to `make`
[no-cd]
make *args:
    @make -C {{current_dir}} {{args}}
