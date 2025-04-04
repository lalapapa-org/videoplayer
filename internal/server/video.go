package server

import (
	"errors"
	"net/http"
	"time"

	"github.com/GizmoVault/gotools/hashx"
	"github.com/gin-gonic/gin"
	"github.com/lalapapa-org/videoplayer/internal/playlistx"
)

func (s *Server) handleVideoSaveTm(c *gin.Context) {
	err := s.handleVideoSaveTmInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, gin.H{})
}

func (s *Server) getFileFromVideoID(videoID string) (file string, exists bool) {
	vi, ok := s.dCache.Get(s.videoIDKey(videoID))
	if !ok {
		return
	}

	file, ok = vi.(string)
	if !ok {
		return
	}

	exists = true

	return
}

func (s *Server) setVideoTm(video string, tm int) (err error) {
	saveID := hashx.MD5(video)

	err = s.lastVideoTms.Change(func(oldM map[string]LastVideoTmItem) (newM map[string]LastVideoTmItem, _ error) {
		newM = oldM

		if len(newM) == 0 {
			newM = make(map[string]LastVideoTmItem)
		}

		if tm <= 0 {
			delete(newM, saveID)
		}

		newM[saveID] = LastVideoTmItem{
			Tm:       tm,
			UpdateAt: time.Now(),
		}

		return
	})

	return
}

func (s *Server) handleVideoSaveTmInner(c *gin.Context) (err error) {
	var req VideoTmRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	video, ok := s.getFileFromVideoID(req.VideoID)
	if !ok {
		err = errors.New("invalid video id")

		return
	}

	err = s.setVideoTm(video, req.Tm)

	return
}

func (s *Server) getVideoTm(videoID string) (tm int) {
	video, ok := s.getFileFromVideoID(videoID)
	if !ok {
		return
	}

	saveID := hashx.MD5(video)

	s.lastVideoTms.Read(func(m map[string]LastVideoTmItem) {
		tm = m[saveID].Tm
	})

	return
}

func (s *Server) handleVidePlayFinished(c *gin.Context) {
	nextFile, err := s.handleVidePlayFinishedInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, gin.H{
		"next": nextFile,
	})
}

func (s *Server) handleVidePlayFinishedInner(c *gin.Context) (nextFile string, err error) {
	var req VidePlayFinishedRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	_ = s.setVideoTm(req.Path, 0)

	fs, fsID, _, err := s.explainFSPath(req.Path)
	if err != nil {
		return
	}

	playlistFs, ok := fs.(playlistx.PlaylistFS)
	if !ok {
		return
	}

	curIdx := playlistFs.GetCurIndex()
	nextIdx := playlistFs.NextIndex()

	if curIdx == nextIdx || (curIdx > 0 && nextIdx == 0) {
		return
	}

	err = s.roots.Change(func(o *TopRoots) (n *TopRoots, err error) {
		n = o

		var r PlaylistRoot

		r, ok = n.PlayListRoots[fsID]
		if !ok {
			return
		}

		r.CurIndex = nextIdx

		nextFile = r.Items[r.CurIndex]

		return
	})

	return
}
