package server

import (
	"net/http"
	"path"
	"strings"

	"github.com/GizmoVault/gotools/base/commerrx"
	"github.com/gin-gonic/gin"
	"github.com/lalapapa-org/videoplayer/internal/i"
)

var (
	videoExtMap = map[string]any{"mp4": true, "avi": true, "mov": true, "wmv": true, "flv": true,
		"mkv": true, "webm": true, "m4v": true, "3gp": true, "mpeg": true, "rmvb": true, "ts": true,
		"vob": true}
)

func (s *Server) isVideoFile(p string) bool {
	ext := strings.ToLower(path.Ext(p))

	_, ok := videoExtMap[ext[1:]]

	return ok
}

func (s *Server) handlePlayListPreview(c *gin.Context) {
	items, err := s.handlePlayListPreviewInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, PlayListPreviewResponse{
		Items: items,
	})
}

func (s *Server) explainFSPath(path string) (fs i.FS, fsID, subDir string, err error) {
	ps := strings.Split(path, "/")

	fsID = ps[0]

	fs = s.getFS(ps[0])
	if fs == nil {
		err = commerrx.ErrNotFound

		return
	}

	subDir = strings.Join(ps[1:], "/")

	return
}

func (s *Server) handlePlayListPreviewInner(c *gin.Context) (items []string, err error) {
	var req PlayListPreviewRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	rFs, _, subDir, err := s.explainFSPath(req.Path)
	if err != nil {
		return
	}

	fr, err := rFs.List(subDir)
	if err != nil {
		return
	}

	for _, entry := range fr {
		if entry.Stat == nil {
			continue
		}

		if entry.Stat.IsDir() {
			continue
		}

		if req.OnlyVideoFiles {
			if !s.isVideoFile(entry.Path) {
				continue
			}
		}

		items = append(items, entry.Path)
	}

	return
}

func (s *Server) handlePlayListSave(c *gin.Context) {
	id, name, err := s.handlePlayListSaveInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":   id,
		"name": name,
	})
}

func (s *Server) handlePlayListSaveInner(c *gin.Context) (id, name string, err error) {
	var req PlayListSaveRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	id, name, err = s.addRoot(&RootRequest{
		RType:        "playlist",
		PlaylistPath: req.Path,
		Playlist:     req.Items,
	})

	return
}

func (s *Server) isPlaylistExists(path string) (playlistID string, exists bool) {
	s.roots.Read(func(d *TopRoots) {
		for id, root := range d.PlayListRoots {
			if root.Path == path {
				playlistID = id

				exists = true

				break
			}
		}
	})

	return
}

func (s *Server) handlePlaylistOpeningEndingPOST(c *gin.Context) {
	err := s.handlePlaylistOpeningEndingPOSTInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, gin.H{})
}

func (s *Server) handlePlaylistOpeningEndingPOSTInner(c *gin.Context) (err error) {
	var req PlaylistOpeningEndingPOSTRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	err = s.setPlaylistOpeningEndingTm(req.Path, req.OpeningTm, req.EndingTm)
	if err != nil {
		return
	}

	return
}

func (s *Server) handlePlaylistOpeningEndingGET(c *gin.Context) {
	opening, ending, err := s.handlePlaylistOpeningEndingGETInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, gin.H{
		"opening": opening,
		"ending":  ending,
	})
}

func (s *Server) handlePlaylistOpeningEndingGETInner(c *gin.Context) (opening, ending int, err error) {
	opening, ending = s.getPlaylistOpeningEndingTm(c.Query("path"))

	return
}
