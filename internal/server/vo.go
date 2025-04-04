package server

type VOFSItem struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Size  string `json:"size"`
	IsDir bool   `json:"is_dir"`
}
