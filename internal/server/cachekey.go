package server

func (s *Server) videoIDKey(videoID string) string {
	return "video-id:" + videoID
}
