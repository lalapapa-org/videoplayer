package playlistx

import (
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/lalapapa-org/videoplayer/internal/i"
)

type PlaylistFS interface {
	i.FS

	SetCurItem(item string) error
	SetCurIndex(idx int) error
	GetCurIndex() int
	NextIndex() int
}

func NewPlaylistXProvider(path string, items []string, rawFS i.FS) PlaylistFS {
	ps := strings.SplitN(path, "/", 2)

	path = strings.Join(ps[1:], "/")

	return &playlistXProvider{
		path:  path,
		items: items,
		rawFS: rawFS,
	}
}

type playlistXProvider struct {
	path  string
	items []string
	rawFS i.FS

	curIndex int
}

func (impl *playlistXProvider) SetCurItem(file string) error {
	for idx, item := range impl.items {
		if item == file {
			impl.curIndex = idx

			break
		}
	}

	return nil
}

func (impl *playlistXProvider) NextIndex() int {
	impl.curIndex++
	if impl.curIndex >= len(impl.items) {
		impl.curIndex = 0
	}

	return impl.curIndex
}

func (impl *playlistXProvider) GetCurIndex() int {
	return impl.curIndex
}

func (impl *playlistXProvider) SetCurIndex(idx int) (err error) {
	impl.curIndex = idx

	return
}

func (impl *playlistXProvider) List(_ string) (items []*i.FSEntry, err error) {
	items = make([]*i.FSEntry, 0, len(impl.items))

	for _, item := range impl.items {
		var info os.FileInfo

		info, err = impl.StatFile(item)
		if err != nil {
			items = append(items, &i.FSEntry{
				Path: item + " - [暂时不可访问]",
				Stat: info,
			})
		} else {
			items = append(items, &i.FSEntry{
				Path: item,
				Stat: info,
			})
		}
	}

	return
}

func (impl *playlistXProvider) StatFile(path string) (os.FileInfo, error) {
	return impl.rawFS.StatFile(filepath.Join(impl.path, path))
}

func (impl *playlistXProvider) OpenFile(path string) (io.ReadSeekCloser, error) {
	return impl.rawFS.OpenFile(filepath.Join(impl.path, path))
}
