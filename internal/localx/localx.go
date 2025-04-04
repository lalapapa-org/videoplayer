package localx

import (
	"io"
	iofs "io/fs"
	"os"
	"path/filepath"

	"github.com/GizmoVault/gotools/base/commerrx"
	"github.com/lalapapa-org/videoplayer/internal/i"
)

func TestLocal(path string) (err error) {
	stat, err := os.Stat(path)
	if err != nil {
		return
	}

	if !stat.IsDir() {
		err = commerrx.ErrBadFormat

		return
	}

	return err
}

func NewLocalXProvider(path string) i.FS {
	return &localXProvider{
		path: path,
	}
}

type localXProvider struct {
	path string
}

func (impl *localXProvider) List(path string) (files []*i.FSEntry, err error) {
	err = iofs.WalkDir(os.DirFS(filepath.Join(impl.path, path)), ".", func(p string, d iofs.DirEntry, e error) error {
		if e != nil {
			err = e

			return e
		}

		if p == "." || p == ".." {
			return nil
		}

		di, _ := d.Info()

		files = append(files, &i.FSEntry{
			Path: p,
			Stat: di,
		})

		if d.IsDir() {
			return iofs.SkipDir
		}

		return nil
	})

	return
}

func (impl *localXProvider) StatFile(path string) (os.FileInfo, error) {
	return os.Stat(filepath.Join(impl.path, path))
}

func (impl *localXProvider) OpenFile(path string) (io.ReadSeekCloser, error) {
	return os.Open(filepath.Join(impl.path, path))
}
