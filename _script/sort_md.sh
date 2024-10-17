#!/bin/bash
source "$(dirname ${BASH_SOURCE})/funcs.sh"

BOOK=$1;
check_var BOOK

# Find all markdown files and sort them alphabetically
files=$(find "hugo/content/${BOOK}/" -type f -name "*.md" | sort)

# Initialize arrays for index and non-index files
declare -A index_files
declare -A dir_weights
declare -A dir_files

# Separate _index.md files from other files and determine minimum weight for each directory
while IFS= read -r file; do
  dir=$(dirname "$file")

  if [[ "$file" == */_index.md ]]; then
    index_files["$dir"]="$file"
  else
    # Extract weight from filename (assumes weight is the first number in the filename)
    weight=$(basename "$file" | grep -o '^[0-9]\+')
    if [[ -z "$weight" ]]; then
      fault "Cannot sort by weight because filename is missing weight: ${file}"
    fi
    # Remove leading zeros for proper numeric comparison
    weight=$((10#$weight))

    # Update the directory's minimum weight and store the files
    if [[ -z "${dir_weights[$dir]}" ]] || (( weight < dir_weights[$dir] )); then
      dir_weights["$dir"]=$weight
    fi
    dir_files["$dir"]+="$file"$'\n'
  fi
done <<< "$files"

# Sort directories by their minimum weight
sorted_dirs=$(for dir in "${!dir_weights[@]}"; do
  echo "${dir_weights[$dir]} $dir"
done | sort -n | awk '{print $2}')

# Collect the final sorted list
final_sorted_list=()

# Add sorted directories, including their _index.md and other files
for dir in $sorted_dirs; do
  # Add the _index.md file if it exists
  if [[ -n "${index_files[$dir]}" ]]; then
    final_sorted_list+=("${index_files[$dir]}")
  fi

  # Add all other files in the directory
  if [[ -n "${dir_files[$dir]}" ]]; then
    while IFS= read -r file; do
      [[ -n "$file" ]] && final_sorted_list+=("$file")
    done <<< "${dir_files[$dir]}"
  fi
done

# Add the top-level _index.md file if it wasn't added already
top_level_index="hugo/content/portable-docker/_index.md"
if [[ -n "${index_files[hugo/content/portable-docker]}" ]] && [[ ! " ${final_sorted_list[*]} " =~ " $top_level_index " ]]; then
  final_sorted_list+=("$top_level_index")
fi

# Print the final sorted list
printf "%s\0" "${final_sorted_list[@]}"
