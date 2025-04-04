package smbx

import (
	"strconv"
	"testing"

	"github.com/lalapapa-org/videoplayer/internal/i"
	"github.com/stretchr/testify/assert"
)

func TestSmb1(t *testing.T) {
	fs := NewSmbXProvider("10.0.0.141:445", "x", "")

	files, err := fs.List("/")
	assert.Nil(t, err)
	dumpFiles(t, files)

	files, err = fs.List("/hd1/videos/[y5y4.com][国产经典]葫芦兄弟(葫芦娃).全13集.1986.WEB-DL.1080P.H264.AAC-AIU")
	assert.Nil(t, err)
	dumpFiles(t, files)

	fi, err := fs.StatFile("/hd1/videos/[y5y4.com][国产经典]葫芦兄弟(葫芦娃).全13集.1986.WEB-DL.1080P.H264.AAC-AIU/葫芦兄弟_13.mp4")
	assert.Nil(t, err)
	t.Log(fi)

	s, err := fs.OpenFile("/hd1/videos/[y5y4.com][国产经典]葫芦兄弟(葫芦娃).全13集.1986.WEB-DL.1080P.H264.AAC-AIU/葫芦兄弟_13.mp4")
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
