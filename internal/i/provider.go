package i

import (
	"io"
	"io/fs"
	"os"
)

type FSEntry struct {
	Path string
	Stat fs.FileInfo
}

type FS interface {
	List(path string) ([]*FSEntry, error)
	StatFile(path string) (os.FileInfo, error)
	OpenFile(path string) (io.ReadSeekCloser, error)
}
