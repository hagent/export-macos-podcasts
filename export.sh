#!/usr/bin/env bash

NODE_VER_FULL=$(node -v)
NODE_VER=${NODE_VER_FULL:1:2}

if [[ "$NODE_VER" = *.* ]]; then
  echo "your nodejs version < 14, please install >= 14 https://nodejs.org/en/download/"
  exit 1
fi

if [ -z "$NODE_VER" ]; then
  echo "please install nodejs version >=14 https://nodejs.org/en/download/"
  exit 1;
fi

if (( NODE_VER < 14 )); then
  echo "your nodejs version < 14, please install >= 14 https://nodejs.org/en/download/"
  exit 1
  
else
  npm install
  npm start
fi