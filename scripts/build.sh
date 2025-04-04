#!/bin/bash

dest=./dest

rm -rf ${dest} || true
mkdir $dest

build_single() {
  GOOS=${1} GOARCH=${2} go build -ldflags "-s -w" -o "${3}" cmd/video_player/main.go
  #if [[ ${1} != "darwin" || ${2} != "mipsle" ]]; then
  #  upx --brute  "${3}"
  #fi
}

oa_es=(linux:amd64 linux:arm64 linux:arm linux:mipsle darwin:amd64 darwin:arm64 windows:amd64:.exe)

for oa in "${oa_es[@]}"
do
  oa_s=(${oa//:/ })
  echo build_single "${oa_s[0]}" "${oa_s[1]}" "${dest}/video_player_${oa_s[0]}_${oa_s[1]}${oa_s[2]}"
  build_single "${oa_s[0]}" "${oa_s[1]}" "${dest}/video_player_${oa_s[0]}_${oa_s[1]}${oa_s[2]}"
done


