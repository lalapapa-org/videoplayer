package config

import (
	"sync"

	"github.com/GizmoVault/gotools/configx"
)

type Config struct {
	Listen    string `yaml:"listen"`
	DataRoot  string `yaml:"dataRoot"`
	CacheRoot string `yaml:"cacheRoot"`
}

var (
	_config Config
	_once   sync.Once
)

func GetConfig() *Config {
	_once.Do(func() {
		_, err := configx.Load("video-player.yaml", &_config)
		if err != nil {
			panic(err)
		}
	})

	return &_config
}
