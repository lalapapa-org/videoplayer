package server

import (
	"errors"
	"io"
	"io/fs"
	"net/http"
	"path/filepath"
	"time"

	"github.com/GizmoVault/gotools/base/commerrx"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/lalapapa-org/videoplayer/internal/playlistx"
)

type StreamSession struct {
	stream io.ReadSeekCloser
	stat   fs.FileInfo
}

func (ss *StreamSession) Close() {
	if ss.stream != nil {
		_ = ss.stream.Close()
	}
}

func (s *Server) GetStreamFile(rID, file string) (ss *StreamSession, err error) {
	rFs := s.getFS(rID)
	if rFs == nil {
		err = commerrx.ErrNotFound

		return
	}

	stat, err := rFs.StatFile(file)
	if err != nil {
		return
	}

	stream, err := rFs.OpenFile(file)
	if err != nil {
		return
	}

	ss = &StreamSession{
		stream: stream,
		stat:   stat,
	}

	return
}

type SVideoRequest struct {
	VideoURL string `json:"video_url"`
}

type SVideoResponse struct {
	VideoID string `json:"video_id"`
	LastTm  int    `json:"last_tm"`
}

func (s *Server) handleSVideoID(c *gin.Context) {
	videoID, err := s.handleSVideoIDInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, SVideoResponse{
		VideoID: videoID,
		LastTm:  s.getVideoTm(videoID),
	})
}

func (s *Server) handleSVideoIDInner(c *gin.Context) (videoID string, err error) {
	var req SVideoRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	if req.VideoURL == "" {
		err = errors.New("no video url")

		return
	}

	rFs, fsID, subDir, err := s.explainFSPath(req.VideoURL)
	if err != nil {
		return
	}

	if playlistFs, ok := rFs.(playlistx.PlaylistFS); ok {
		_ = playlistFs.SetCurItem(subDir)

		err = s.roots.Change(func(o *TopRoots) (n *TopRoots, err error) {
			n = o

			var r PlaylistRoot

			r, ok = n.PlayListRoots[fsID]
			if !ok {
				return
			}

			r.CurIndex = playlistFs.GetCurIndex()

			n.PlayListRoots[fsID] = r

			return
		})
	}

	videoID = uuid.NewString() + filepath.Ext(req.VideoURL)

	s.dCache.Set(s.videoIDKey(videoID), req.VideoURL, time.Hour*2)

	return
}
