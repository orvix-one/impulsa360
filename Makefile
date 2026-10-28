.PHONY: help install env pods clean clean-all start android ios web lint doctor preflight aab devices

# Gradle 8.13 requiere JDK 17 (no corre con JDK 25 de Android Studio)
export ANDROID_HOME ?= $(HOME)/Library/Android/sdk
export JAVA_HOME ?= $(shell /usr/libexec/java_home -v 17 2>/dev/null)
export PATH := $(ANDROID_HOME)/platform-tools:$(ANDROID_HOME)/emulator:$(PATH)

help:
	@echo "Comandos disponibles:"
	@echo "  make install    Instala dependencias npm y crea .env si no existe"
	@echo "  make pods       Instala pods de iOS"
	@echo "  make clean      Limpia caches de Metro/Expo y builds nativos"
	@echo "  make clean-all  clean + borra node_modules y Pods"
	@echo "  make start      Inicia Metro (expo start)"
	@echo "  make devices    Lista emuladores/dispositivos conectados"
	@echo "  make android    Compila y ejecuta en Android"
	@echo "  make ios        Compila y ejecuta en iOS"
	@echo "  make web        Ejecuta version web"
	@echo "  make lint       Ejecuta eslint"
	@echo "  make doctor     Ejecuta expo-doctor"
	@echo "  make preflight  Verifica configuracion de release Android"
	@echo "  make aab        Genera Android App Bundle de release"

install: env
	npm install

env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Se creo .env desde .env.example: completa las credenciales de Supabase"; \
	fi

pods:
	cd ios && pod install

clean:
	rm -rf .expo node_modules/.cache $${TMPDIR:-/tmp}/metro-* $${TMPDIR:-/tmp}/haste-map-*
	rm -rf android/app/build android/build android/.gradle
	rm -rf ios/build
	-watchman watch-del-all 2>/dev/null

clean-all: clean
	rm -rf node_modules ios/Pods

start:
	npx expo start --clear

devices:
	$(ANDROID_HOME)/platform-tools/adb devices

android:
	@if [ -z "$$JAVA_HOME" ]; then echo "Falta JDK 17: brew install --cask zulu@17"; exit 1; fi
	npm run android

ios:
	npm run ios

web:
	npm run web

lint:
	npm run lint

doctor:
	npx expo-doctor

preflight:
	npm run preflight:android

aab:
	npm run build:android:aab
