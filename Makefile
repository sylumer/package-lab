# Package Lab: build, install, test and clean. `make` (or `make help`) lists the targets.
# Every build goes through scripts/package.js; see docs/developer-guide.md and docs/windows.md.

NPM      := npm
NODE     := node
PACKAGE  := $(NODE) scripts/package.js
APP      := /Applications/Package Lab.app

# Download caches outside the repo (macOS locations; ELECTRON_CACHE / PLAYWRIGHT_BROWSERS_PATH override them).
ELECTRON_CACHE           ?= $(HOME)/Library/Caches/electron
PLAYWRIGHT_BROWSERS_PATH ?= $(HOME)/Library/Caches/ms-playwright

.DEFAULT_GOAL := help
.PHONY: help deps ci webkit start serve practice guide guide-pdf \
        mac mac-arm64 mac-x64 mac-install mac-uninstall alfred link unlink \
        win win-x64 win-arm64 all \
        test test-unit test-slow test-ui test-all screenshots \
        clean clean-icons clean-caches distclean

##@ Help

help: ## Show this list
	@awk 'BEGIN {FS = ":.*## "} /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo

##@ Setup

deps: ## Install dependencies (npm install)
	$(NPM) install

ci: ## Clean install from the lockfile (npm ci)
	$(NPM) ci

webkit: ## Download Playwright's WebKit, for Safari-engine runs
	npx playwright install webkit

##@ Run from source

start: ## Open the desktop app from source
	$(NPM) start

serve: ## Start the web interface with no window
	$(NPM) run serve

practice: ## Build the User Guide's practice packages in ./practice
	$(NPM) run practice

guide: ## Write the User Guide as one HTML file, dist/Package Lab User Guide.html
	$(NPM) run guide

guide-pdf: ## Write the User Guide as a PDF, dist/Package Lab User Guide.pdf
	$(NPM) run guide:pdf

##@ Mac

mac: ## Build Package Lab.app for this Mac's architecture
	$(PACKAGE)

mac-arm64: ## Build Package Lab.app for Apple silicon
	$(PACKAGE) --arch arm64

mac-x64: ## Build Package Lab.app for Intel Macs
	$(PACKAGE) --arch x64

mac-install: ## Build and install to /Applications, registered with Finder
	$(PACKAGE) --install

mac-uninstall: ## Remove Package Lab.app from /Applications
	rm -rf "$(APP)"

alfred: ## Build the Alfred workflow and open it for import
	$(NPM) run alfred

link: ## Put the package-lab command on PATH (npm link)
	$(NPM) link

unlink: ## Remove the package-lab command from PATH
	$(NPM) unlink -g package-lab

##@ Windows (portable zip, built on the Mac)

win: ## Build the Windows app and zip for this Mac's architecture
	$(PACKAGE) --platform win32

win-x64: ## Build the Windows app and zip for x64
	$(PACKAGE) --platform win32 --arch x64

win-arm64: ## Build the Windows app and zip for arm64
	$(PACKAGE) --platform win32 --arch arm64

##@ Everything

all: mac-arm64 mac-x64 win-x64 win-arm64 alfred ## Every build: both Mac architectures, both Windows ones, Alfred

##@ Test

test: ## Run the test suite
	$(NPM) test

test-unit: ## Unit tests only (fast)
	$(NODE) test/test.js --unit

test-slow: ## The suite plus the slower end-to-end checks
	$(NODE) test/test.js --slow

test-ui: ## UI tests (drives Electron)
	$(NPM) run test:ui

test-all: test-slow test-ui ## Everything: slow suite and UI tests

screenshots: ## Regenerate the docs' screenshots
	$(NPM) run screenshots

##@ Clean

clean: ## Remove dist/ (every build, zip and workflow)
	rm -rf dist

clean-icons: ## Remove generated icons (icon.png, .icns, .ico); remade on the next build
	rm -f build/icon.png build/icon.icns build/icon.ico

clean-caches: ## Remove downloaded Electron builds and Playwright browsers
	rm -rf "$(ELECTRON_CACHE)" "$(PLAYWRIGHT_BROWSERS_PATH)"

distclean: clean clean-icons ## clean + clean-icons + node_modules (run `make deps` after)
	rm -rf node_modules
