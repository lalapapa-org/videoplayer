package server

import (
	"embed"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/GizmoVault/gotools/pathx"
	"github.com/GizmoVault/gotools/storagex"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/memstore"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	cors "github.com/itsjamie/gin-cors"
	"github.com/lalapapa-org/videoplayer/internal/config"
	"github.com/lalapapa-org/videoplayer/internal/localx"
	"github.com/lalapapa-org/videoplayer/internal/playlistx"
	"github.com/lalapapa-org/videoplayer/internal/smbx"
	"github.com/patrickmn/go-cache"
)

//go:embed tpl/*.html
var tpl embed.FS

//go:embed static/*
var fsStatic embed.FS

type Server struct {
	cfg *config.Config

	dCache *cache.Cache

	roots        *storagex.MemWithFile[*TopRoots, storagex.Serial, storagex.Lock]
	lastVideoTms *storagex.MemWithFile[map[string]LastVideoTmItem, storagex.Serial, storagex.Lock]
}

func (s *Server) BeforeLoad() {

}

func (s *Server) AfterLoad(r *TopRoots, err error) {
	if err != nil {
		return
	}

	r.fix()

	for id, root := range r.SMBRoots {
		r.fsMap[id] = smbx.NewSmbXProvider(root.Address, root.User, root.Password)
	}

	for id, root := range r.LocalRoots {
		r.fsMap[id] = localx.NewLocalXProvider(root)
	}

	for id, root := range r.PlayListRoots {
		ps := strings.Split(root.Path, "/")

		rFS := r.fsMap[ps[0]]
		if rFS != nil {
			playlistFS := playlistx.NewPlaylistXProvider(root.Path, root.Items, rFS)

			_ = playlistFS.SetCurIndex(root.CurIndex)

			r.fsMap[id] = playlistFS
		}
	}
}

func (s *Server) BeforeSave() {

}

func (s *Server) AfterSave(_ *TopRoots, _ error) {

}

type LastVideoTmItem struct {
	Tm       int       `json:"tm,omitempty"`
	UpdateAt time.Time `json:"ua,omitempty"`
}

func NewServer(cfg *config.Config) *Server {
	_ = pathx.MustDirExists(cfg.DataRoot)
	_ = pathx.MustDirExists(cfg.CacheRoot)

	s := &Server{
		cfg:    cfg,
		dCache: cache.New(time.Minute, time.Minute),
		lastVideoTms: storagex.NewMemWithFileEx1[map[string]LastVideoTmItem, storagex.Serial, storagex.Lock](
			make(map[string]LastVideoTmItem), &storagex.JSONSerial{
				MarshalIndent: true,
			}, &sync.RWMutex{}, filepath.Join(cfg.DataRoot, "last_video_tms.json"), nil, nil, time.Second*5),
	}

	s.roots = storagex.NewMemWithFileEx[*TopRoots, storagex.Serial, storagex.Lock](
		&TopRoots{}, &storagex.JSONSerial{
			MarshalIndent: true,
		}, &sync.RWMutex{}, filepath.Join(cfg.DataRoot, "roots.json"), nil, s)

	s.init()

	return s
}

func (s *Server) init() {
	go s.httpRoutine()
}

func (s *Server) Wait() {
	<-make(chan any)
}

func (s *Server) httpRoutine() {
	httpServer := gin.Default()

	httpServer.Use(cors.Middleware(cors.Config{
		ValidateHeaders: false,
		Origins:         "*",
		RequestHeaders:  "",
		ExposedHeaders:  "",
		Methods:         "",
		MaxAge:          0,
		Credentials:     false,
	}))

	//store := cookie.NewStore([]byte("secret"))
	store := memstore.NewStore([]byte("secret"))
	httpServer.Use(sessions.Sessions("my-session", store))

	static, _ := fs.Sub(fsStatic, "static")
	httpServer.StaticFS("/static", http.FS(static))

	tmpl, err := template.ParseFS(tpl, "tpl/*.html")
	if err != nil {
		log.Fatal(err)
	}

	httpServer.SetHTMLTemplate(tmpl)

	httpServer.StaticFileFS("/favicon.ico", "/static/favicon.ico", http.FS(fsStatic))

	httpServer.POST("/test-root", s.handleTestRoot)
	httpServer.POST("/add-root", s.handleAddRoot)
	httpServer.POST("/remove-root", s.handleRemoveRoot)
	httpServer.POST("/rename-root", s.handleRenameRoot)

	httpServer.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	httpServer.POST("/browser", s.handleBrowser)

	httpServer.GET("/videos", s.ServeStreamFile)
	httpServer.POST("/video/save-tm", s.handleVideoSaveTm)
	httpServer.POST("/video/play/finished", s.handleVidePlayFinished)

	httpServer.POST("/s-video-id", s.handleSVideoID)

	httpServer.POST("/play-list/preview", s.handlePlayListPreview)
	httpServer.POST("/play-list/save", s.handlePlayListSave)

	_ = httpServer.Run(s.cfg.Listen)
}

func (s *Server) ServeStreamFile(c *gin.Context) {
	err := s.serveStreamFile(c)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
	}
}

func (s *Server) serveStreamFile(c *gin.Context) (err error) {
	id := uuid.NewString()

	videoID, ok := c.GetQuery("file")
	if !ok {
		err = errors.New("no query")

		return
	}

	video, ok := s.getFileFromVideoID(videoID)
	if !ok {
		err = errors.New("invalid video id")

		return
	}

	fmt.Printf("%s before get stream\n", id)

	ps := strings.SplitN(video, "/", 2)
	rID := ps[0]
	video = strings.Join(ps[1:], "/")

	ss, err := s.GetStreamFile(rID, video)
	if err != nil {
		fmt.Printf("%s before get stream: failed - %v\n", id, err)

		return
	}

	fmt.Printf("%s after get stream\n", id)

	defer ss.Close()

	fmt.Printf("%s before serve content\n", id)
	http.ServeContent(c.Writer, c.Request, video, ss.stat.ModTime(), ss.stream)
	fmt.Printf("%s after serve content\n", id)

	return
}
