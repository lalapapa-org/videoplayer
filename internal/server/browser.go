package server

import (
	"errors"
	"io/fs"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/GizmoVault/gotools/base/commerrx"
	"github.com/GizmoVault/gotools/formatx"
	"github.com/gin-gonic/gin"
	"github.com/lalapapa-org/videoplayer/internal/playlistx"
)

func (s *Server) handleBrowser(c *gin.Context) {
	curDir, curDirname, items, playlistFlag, playlistID, canRemove, err := s.handleBrowserInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, BrowserResp{
		Path:         curDir,
		PathName:     curDirname,
		Items:        items,
		PlaylistFlag: playlistFlag,
		PlaylistID:   playlistID,
		CanRemove:    canRemove,
	})
}

func (s *Server) handleBrowserInner(c *gin.Context) (curDir, curDirname string,
	fsItems []VOFSItem, playlistFlag int, playlistID string, canRemove bool, err error) {
	var req BrowserRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	curDir = strings.TrimPrefix(req.Path, "/")
TryTop:
	if curDir == "" && req.Dir == "" {
		s.roots.Read(func(d *TopRoots) {
			fsItems = make([]VOFSItem, 0, len(d.RootStats))

			for _, stat := range d.RootStats {
				fsItems = append(fsItems, VOFSItem{
					Name:  stat.Name,
					Path:  stat.ID,
					IsDir: true,
				})
			}
		})

		return
	}

	switch req.Op {
	case "enter":
		if curDir == "" {
			curDir = req.Dir
		} else {
			curDir = filepath.Join(curDir, req.Dir)
		}
	case "leave":
		if curDir == "" {
			err = errors.New("top")

			return
		}

		curDir = strings.TrimSuffix(curDir, "/")

		index := strings.LastIndex(curDir, "/")

		if index != -1 {
			curDir = curDir[0:index]
		} else {
			curDir = ""

			goto TryTop
		}
	}

	ps := strings.Split(curDir, "/")

	rFs := s.getFS(ps[0])
	if rFs == nil {
		err = commerrx.ErrNotFound

		return
	}

	subDir := strings.Join(ps[1:], "/")
	curDirname = s.getFSName(ps[0]) + "/" + subDir

	fr, err := rFs.List(subDir)
	if err != nil {
		return
	}

	playlistFs, _ := rFs.(playlistx.PlaylistFS)

	canRemove = subDir == ""

	fsItems = make([]VOFSItem, 0, len(fr))

	fnSize := func(index int, stat fs.FileInfo) string {
		if stat == nil {
			return ""
		}

		sizeS := formatx.FormatSizePrecise(stat.Size())

		if playlistFs != nil {
			if playlistFs.GetCurIndex() == index {
				sizeS = "▶️    " + sizeS
			}
		}

		return sizeS
	}

	var videoNumbers int

	for idx, item := range fr {
		if item.Stat != nil {
			if !item.Stat.IsDir() {
				if s.isVideoFile(item.Path) {
					videoNumbers++
				}
			}
		}

		fsItems = append(fsItems, VOFSItem{
			Name:  item.Path,
			Path:  item.Path,
			Size:  fnSize(idx, item.Stat),
			IsDir: item.Stat == nil || item.Stat.IsDir(),
		})
	}

	if plID, exists := s.isPlaylistExists(curDir); exists {
		playlistFlag = 1

		playlistID = plID
	}

	if playlistFlag != 1 {
		if _, ok := rFs.(playlistx.PlaylistFS); !ok {
			if videoNumbers >= 2 {
				playlistFlag = 2
			}
		}
	}

	return
}
