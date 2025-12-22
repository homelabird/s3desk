package main

import (
	"context"
	"flag"
	"fmt"
	"log"

	"github.com/getkin/kin-openapi/openapi3"
)

func main() {
	specPath := flag.String("spec", "../openapi.yml", "path to OpenAPI spec (yaml/json)")
	flag.Parse()

	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = true

	doc, err := loader.LoadFromFile(*specPath)
	if err != nil {
		log.Fatalf("load spec: %v", err)
	}
	if err := doc.Validate(context.Background()); err != nil {
		log.Fatalf("validate spec: %v", err)
	}

	fmt.Println("ok")
}
