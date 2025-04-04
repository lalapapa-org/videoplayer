package server

import (
	"fmt"
	"net/http"
	"path/filepath"
	"slices"
	"strings"

	"github.com/GizmoVault/gotools/base/commerrx"
	"github.com/GizmoVault/gotools/base/cuserrorx"
	"github.com/gin-gonic/gin"
	"github.com/godruoyi/go-snowflake"
	"github.com/lalapapa-org/videoplayer/internal/i"
	"github.com/lalapapa-org/videoplayer/internal/localx"
	"github.com/lalapapa-org/videoplayer/internal/playlistx"
	"github.com/lalapapa-org/videoplayer/internal/smbx"
)

var (
	RootIDPrefixLocalDir = "L-"
	RootIDPrefixSMB      = "S-"
	RootIDPrefixPlaylist = "P-"
	RootIDPrefixHistory  = "H-"
)

type RootStat struct {
	ID   string `json:"id"` // prefix: L(local dir);S(smb); H(history)
	Name string `json:"name"`
}

type SMBRoot struct {
	Address  string
	User     string
	Password string
}

type PlaylistRoot struct {
	Path     string
	Items    []string
	CurIndex int
}

type TopRoots struct {
	RootStats []RootStat

	SMBRoots      map[string]SMBRoot
	LocalRoots    map[string]string
	PlayListRoots map[string]PlaylistRoot

	fsMap map[string]i.FS
}

func (tr *TopRoots) fix() {
	if len(tr.SMBRoots) == 0 {
		tr.SMBRoots = make(map[string]SMBRoot)
	}

	if len(tr.LocalRoots) == 0 {
		tr.LocalRoots = make(map[string]string)
	}

	if len(tr.PlayListRoots) == 0 {
		tr.PlayListRoots = make(map[string]PlaylistRoot)
	}

	if len(tr.fsMap) == 0 {
		tr.fsMap = make(map[string]i.FS)
	}
}

type RootRequest struct {
	RType string `json:"rtype"` // smb, local, playlist

	SMBAddress  string `json:"smb_address"`
	SMBUser     string `json:"smb_user"`
	SMBPassword string `json:"smb_password"`

	LocalPath string `json:"local_path"`

	PlaylistPath string   `json:"playlist_path"`
	Playlist     []string `json:"playlist"`
}

type TestRootResponse struct {
	StatusCode int    `json:"status_code"`
	Message    string `json:"message"`
}

func (s *Server) handleTestRoot(c *gin.Context) {
	var resp TestRootResponse

	err := s.handleTestRootInner(c)
	if err != nil {
		resp.StatusCode = -1
		resp.Message = err.Error()
	}

	c.JSON(http.StatusOK, resp)
}

func (s *Server) handleTestRootInner(c *gin.Context) (err error) {
	var req RootRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	err = s.testRoot(&req)

	return
}

func (s *Server) testRoot(req *RootRequest) (err error) {
	switch req.RType {
	case "smb":
		if !strings.Contains(req.SMBAddress, ":") {
			req.SMBAddress += ":445"
		}

		err = smbx.TestSmbConnect(req.SMBAddress, req.SMBUser, req.SMBPassword)
	case "local":
		err = localx.TestLocal(req.LocalPath)
	default:
		err = commerrx.ErrUnknown
	}

	return
}

func (s *Server) handleAddRoot(c *gin.Context) {
	id, name, err := s.handleAddRootInner(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())

		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":   id,
		"name": name,
	})
}

func (s *Server) handleAddRootInner(c *gin.Context) (id, name string, err error) {
	var req RootRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	err = s.testRoot(&req)
	if err != nil {
		return
	}

	id, name, err = s.addRoot(&req)

	return
}

func (s *Server) addRoot(req *RootRequest) (id, name string, err error) {
	err = s.roots.Change(func(o *TopRoots) (n *TopRoots, err error) {
		n = o
		if n == nil {
			n = &TopRoots{
				RootStats: make([]RootStat, 0, 2),
			}
		}

		n.fix()

		switch req.RType {
		case "smb":

			for _, root := range n.SMBRoots {
				if root.Address == req.SMBAddress && root.User == req.SMBUser {
					err = commerrx.ErrExiting

					return
				}
			}

			id = fmt.Sprintf("%s%d", RootIDPrefixSMB, snowflake.ID())

			n.RootStats = append(n.RootStats, RootStat{
				ID:   id,
				Name: "SMB://" + req.SMBUser + "@" + req.SMBAddress,
			})

			n.SMBRoots[id] = SMBRoot{
				Address:  req.SMBAddress,
				User:     req.SMBUser,
				Password: req.SMBPassword,
			}

			n.fsMap[id] = smbx.NewSmbXProvider(req.SMBAddress, req.SMBUser, req.SMBPassword)
		case "local":
			for _, root := range n.LocalRoots {
				if root == req.LocalPath {
					err = commerrx.ErrExiting

					return
				}
			}

			id = fmt.Sprintf("%s%d", RootIDPrefixLocalDir, snowflake.ID())

			n.RootStats = append(n.RootStats, RootStat{
				ID:   id,
				Name: "本地:" + filepath.Base(req.LocalPath),
			})

			n.LocalRoots[id] = req.LocalPath

			n.fsMap[id] = localx.NewLocalXProvider(req.LocalPath)
		case "playlist":
			for _, root := range n.PlayListRoots {
				if root.Path == req.PlaylistPath {
					err = commerrx.ErrExiting

					return
				}
			}

			id = fmt.Sprintf("%s%d", RootIDPrefixPlaylist, snowflake.ID())

			n.RootStats = append(n.RootStats, RootStat{
				ID:   id,
				Name: "播放列表:" + filepath.Base(req.PlaylistPath),
			})

			n.PlayListRoots[id] = PlaylistRoot{
				Path:     req.PlaylistPath,
				Items:    req.Playlist,
				CurIndex: 0,
			}

			ps := strings.Split(req.PlaylistPath, "/")

			rFS := n.fsMap[ps[0]]
			if rFS != nil {
				n.fsMap[id] = playlistx.NewPlaylistXProvider(req.PlaylistPath, req.Playlist, rFS)
			}
		}

		return
	})

	return
}

func (s *Server) getFS(rid string) (fs i.FS) {
	s.roots.Read(func(d *TopRoots) {
		fs = d.fsMap[rid]
	})

	return
}

func (s *Server) getFSName(rid string) (name string) {
	s.roots.Read(func(d *TopRoots) {
		for _, stat := range d.RootStats {
			if stat.ID == rid {
				name = stat.Name

				break
			}
		}
	})

	return
}

func (s *Server) handleRemoveRoot(c *gin.Context) {
	err := s.handleRemoveRootInner(c)
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"statusCode": 0,
		})

		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": 1,
		"message":    err.Error(),
	})
}

func (s *Server) handleRemoveRootInner(c *gin.Context) (err error) {
	var req RemoveRootRequest

	err = c.ShouldBindJSON(&req)
	if err != nil {
		return
	}

	_, rID, subDir, err := s.explainFSPath(req.Path)
	if err != nil {
		return
	}

	if subDir != "" {
		err = cuserrorx.NewWithErrorMsg("错误的媒体Root")

		return
	}

	err = s.roots.Change(func(o *TopRoots) (n *TopRoots, err error) {
		n = o
		n.fix()

		for id, root := range n.PlayListRoots {
			if strings.HasPrefix(root.Path, rID) {
				err = cuserrorx.NewWithErrorMsg("有播放列表引用，请移除播放类表后再删除")

				return
			}

			if id == req.Path {
				delete(n.PlayListRoots, id)
				delete(n.fsMap, id)

				for idx, stat := range n.RootStats {
					if stat.ID == id {
						n.RootStats = slices.Delete(n.RootStats, idx, idx+1)

						break
					}
				}

				return
			}
		}

		for id := range n.SMBRoots {
			if id == req.Path {
				delete(n.SMBRoots, id)
				delete(n.fsMap, id)

				for idx, stat := range n.RootStats {
					if stat.ID == id {
						n.RootStats = slices.Delete(n.RootStats, idx, idx+1)

						break
					}
				}

				return
			}
		}

		for id := range n.LocalRoots {
			if id == req.Path {
				delete(n.LocalRoots, id)
				delete(n.fsMap, id)

				for idx, stat := range n.RootStats {
					if stat.ID == id {
						n.RootStats = slices.Delete(n.RootStats, idx, idx+1)

						break
					}
				}

				return
			}
		}

		err = commerrx.ErrNotFound

		return
	})

	return
}
