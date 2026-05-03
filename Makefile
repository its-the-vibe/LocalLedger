.PHONY: install build test lint all

## Install Node.js dependencies
install:
	npm install

## Build the project (outputs to dist/)
build: install
	npm run build

## Run unit tests
test: install
	npm test

## Run linter
lint: install
	npm run lint

## Run all checks (lint + test + build)
all: lint test build
