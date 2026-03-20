package store

import (
	"context"

	"gorm.io/gorm"
)

type Store struct {
	db     *gorm.DB
	crypto *profileCrypto
}

type Options struct {
	EncryptionKey string
}

func New(sqlDB *gorm.DB, opts Options) (*Store, error) {
	pc, err := newProfileCrypto(opts.EncryptionKey)
	if err != nil {
		return nil, err
	}
	return &Store{db: sqlDB, crypto: pc}, nil
}

func (s *Store) Ping(ctx context.Context) error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}
