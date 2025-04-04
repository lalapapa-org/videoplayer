package localx

import (
	"strconv"
	"testing"

	"github.com/lalapapa-org/videoplayer/internal/i"
	"github.com/stretchr/testify/assert"
)

func TestSmb1(t *testing.T) {
	t.SkipNow()

	fs := NewLocalXProvider("/")

	files, err := fs.List("/")
	assert.Nil(t, err)
	dumpFiles(t, files)

	files, err = fs.List("/Users/z/Documents/work_lalapapa-video-player/video-be/internal")
	assert.Nil(t, err)
	dumpFiles(t, files)

	fi, err := fs.StatFile("/Users/z/Documents/work_lalapapa-video-player/video-be/internal/localx/localx_test.go")
	assert.Nil(t, err)
	t.Log(fi)

	s, err := fs.OpenFile("/Users/z/Documents/work_lalapapa-video-player/video-be/internal/localx/localx_test.go")
	assert.Nil(t, err)

	defer func() {
		_ = s.Close()
	}()
}

func dumpFiles(t *testing.T, files []*i.FSEntry) {
	t.Log("---->")

	for _, file := range files {
		if file.Stat == nil {
			t.Log("  " + file.Path + ", is share root")
		} else {
			t.Log("  " + file.Path + ", is dir:" + strconv.FormatBool(file.Stat.IsDir()))
		}
	}

	t.Log("<----")
}
