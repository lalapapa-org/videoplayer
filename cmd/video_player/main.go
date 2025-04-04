package main

import (
	"github.com/lalapapa-org/videoplayer/internal/config"
	"github.com/lalapapa-org/videoplayer/internal/server"
)

func main() {
	s := server.NewServer(config.GetConfig())
	s.Wait()
}
