package server

type BrowserRequest struct {
	Path string `json:"path"`
	Op   string `json:"op"`
	Dir  string `json:"dir"`
}

type BrowserResp struct {
	Path     string     `json:"path"`
	PathName string     `json:"pathName"`
	Items    []VOFSItem `json:"items"`

	PlaylistFlag         int    `json:"playlistFlag"` //  1: has playlist; 2: can gen playlist
	PlaylistID           string `json:"playlistID"`
	PlaylistFriendlyPath string `json:"playlistFriendlyPath"`

	CanRemove bool `json:"canRemove"`
}

type PlayListPreviewRequest struct {
	Path           string `json:"path"`
	OnlyVideoFiles bool   `json:"only_video_files"`
}

type PlayListPreviewResponse struct {
	Items []string `json:"items"`
}

type PlayListSaveRequest struct {
	Path  string   `json:"path"`
	Items []string `json:"items"`
}

type VidePlayFinishedRequest struct {
	Path string `json:"path"`
}

type RemoveRootRequest struct {
	Path string `json:"path"`
}

type VideoTmRequest struct {
	VideoID string `json:"vid"`
	Tm      int    `json:"tm"`
}

type RenameRootRequest struct {
	Root string `yaml:"root"`
	Name string `yaml:"name"`
}
