package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	distDir := "dist"
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	fs := http.FileServer(http.Dir(distDir))
	http.Handle("/", fs)

	log.Printf("Serving %s on HTTP port: %s\n", distDir, port)
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatal(err)
	}
}
