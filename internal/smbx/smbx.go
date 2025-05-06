package smbx

import (
	"context"
	"errors"
	"io"
	iofs "io/fs"
	"net"
	"os"
	"strings"
	"time"

	"github.com/hirochachacha/go-smb2"
	"github.com/lalapapa-org/videoplayer/internal/i"
)

func TestSmbConnect(address, user, password string) (err error) {
	if !strings.Contains(address, ":") {
		address += ":445"
	}

	conn, err := net.Dial("tcp", address)
	if err != nil {
		return
	}

	defer func() {
		_ = conn.Close()
	}()

	d := &smb2.Dialer{
		Initiator: &smb2.NTLMInitiator{
			User:     user,
			Password: password,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*30)
	defer cancel()

	session, err := d.DialContext(ctx, conn)
	if err != nil {
		return
	}

	_ = session.Logoff()

	return
}

func NewSmbXProvider(address, user, password string) i.FS {
	return &smbXProvider{
		address:  address,
		user:     user,
		password: password,
		shares:   make(map[string]*smb2.Share),
	}
}

type smbXProvider struct {
	address, user, password string

	conn    net.Conn
	session *smb2.Session
	shares  map[string]*smb2.Share
}

// nolint: unused
func (impl *smbXProvider) deActive() {
	for _, share := range impl.shares {
		if share != nil {
			_ = share.Umount()
		}
	}

	impl.shares = make(map[string]*smb2.Share)

	if impl.session != nil {
		_ = impl.session.Logoff()

		impl.session = nil
	}

	if impl.conn != nil {
		_ = impl.conn.Close()

		impl.conn = nil
	}
}

func (impl *smbXProvider) active() (err error) {
	impl.conn, err = net.DialTimeout("tcp", impl.address, time.Second*20)
	if err != nil {
		return
	}

	d := &smb2.Dialer{
		Initiator: &smb2.NTLMInitiator{
			User:     impl.user,
			Password: impl.password,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*30)
	defer cancel()

	impl.session, err = d.DialContext(ctx, impl.conn)
	if err != nil {
		return
	}

	return
}

func (impl *smbXProvider) mustActive() (err error) {
	if impl.session != nil {
		return
	}

	err = impl.active()

	return
}

func (impl *smbXProvider) listShares() (files []*i.FSEntry, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*30)
	defer cancel()

	shares, err := impl.session.WithContext(ctx).ListSharenames()
	if err != nil {
		impl.fixSMBError(err)

		return
	}

	files = make([]*i.FSEntry, 0, len(shares))

	for _, share := range shares {
		files = append(files, &i.FSEntry{
			Path: share,
		})
	}

	return
}

func (impl *smbXProvider) list(share *smb2.Share, path string) (files []*i.FSEntry, err error) {
	path = strings.TrimPrefix(path, "/")

	fi, err := iofs.Stat(share.DirFS(path), ".")
	if err != nil {
		return
	}

	if !fi.IsDir() {
		err = errors.New("not a dir")

		return
	}

	err = iofs.WalkDir(share.DirFS(path), ".", func(p string, d iofs.DirEntry, e error) error {
		if e != nil {
			err = e

			return e
		}

		if p == "." || p == ".." {
			return nil
		}

		di, _ := d.Info()

		files = append(files, &i.FSEntry{
			Path: p,
			Stat: di,
		})

		if d.IsDir() {
			return iofs.SkipDir
		}

		return nil
	})

	return
}

func (impl *smbXProvider) getShare(shareName string) (share *smb2.Share, err error) {
	err = impl.mustActive()
	if err != nil {
		return
	}

	share, ok := impl.shares[shareName]
	if !ok {
		share, err = impl.session.Mount(shareName)
		if err != nil {
			return
		}

		impl.shares[shareName] = share
	}

	return
}

func (impl *smbXProvider) processPath(path string) (share *smb2.Share, subPath string, err error) {
	path = strings.TrimPrefix(path, "/")

	ps := strings.Split(path, "/")

	share, err = impl.getShare(ps[0])
	if err != nil {
		return
	}

	subPath = "."
	if len(ps) > 1 {
		subPath = strings.Join(ps[1:], "/")
	}

	return
}

func (impl *smbXProvider) List(path string) (files []*i.FSEntry, err error) {
	err = impl.mustActive()
	if err != nil {
		return
	}

	path = strings.TrimPrefix(path, "/")

	if path == "" {
		files, err = impl.listShares()

		return
	}

	ps := strings.Split(path, "/")

	share, err := impl.getShare(ps[0])
	if err != nil {
		return
	}

	if len(ps) > 1 {
		path = strings.Join(ps[1:], "/")
	} else {
		path = "."
	}

	files, err = impl.list(share, path)

	if err != nil {
		impl.fixSMBError(err)
	}

	return
}

func (impl *smbXProvider) StatFile(path string) (fi os.FileInfo, err error) {
	share, subPath, err := impl.processPath(path)
	if err != nil {
		return
	}

	fi, err = share.Stat(subPath)
	if err != nil {
		impl.fixSMBError(err)
	}

	return
}

func (impl *smbXProvider) OpenFile(path string) (stream io.ReadSeekCloser, err error) {
	share, subPath, err := impl.processPath(path)
	if err != nil {
		return
	}

	stream, err = share.Open(subPath)

	if err != nil {
		impl.fixSMBError(err)
	}

	return
}

func (impl *smbXProvider) fixSMBError(err error) {
	if err == nil {
		return
	}

	var e *smb2.TransportError

	if errors.As(err, &e) {
		impl.deActive()
	}
}
