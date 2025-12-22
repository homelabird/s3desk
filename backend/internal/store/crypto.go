package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

const encryptedPrefix = "enc:"

var ErrEncryptedCredentials = errors.New("profile credentials are encrypted; configure ENCRYPTION_KEY (or --encryption-key)")

type profileCrypto struct {
	gcm cipher.AEAD
}

func newProfileCrypto(base64Key string) (*profileCrypto, error) {
	base64Key = strings.TrimSpace(base64Key)
	if base64Key == "" {
		return nil, nil
	}

	key, err := decodeBase64Key(base64Key)
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("encryption key must decode to 32 bytes (got %d)", len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &profileCrypto{gcm: gcm}, nil
}

func decodeBase64Key(s string) ([]byte, error) {
	// Accept common encodings (standard base64 with/without padding, and URL-safe base64).
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if b, err := enc.DecodeString(s); err == nil {
			return b, nil
		}
	}
	return nil, errors.New("invalid base64 encryption key")
}

func (c *profileCrypto) encryptString(plaintext string) (string, error) {
	nonce := make([]byte, c.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := c.gcm.Seal(nil, nonce, []byte(plaintext), nil)
	buf := append(nonce, ciphertext...)
	return encryptedPrefix + base64.RawURLEncoding.EncodeToString(buf), nil
}

func (c *profileCrypto) decryptString(v string) (string, error) {
	if !strings.HasPrefix(v, encryptedPrefix) {
		return v, nil
	}

	enc := strings.TrimPrefix(v, encryptedPrefix)
	raw, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		// Best-effort compatibility with other encodings.
		raw, err = base64.RawStdEncoding.DecodeString(enc)
	}
	if err != nil {
		return "", errors.New("invalid encrypted value encoding")
	}
	if len(raw) < c.gcm.NonceSize() {
		return "", errors.New("invalid encrypted value")
	}
	nonce, ciphertext := raw[:c.gcm.NonceSize()], raw[c.gcm.NonceSize():]
	plaintext, err := c.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", errors.New("failed to decrypt value")
	}
	return string(plaintext), nil
}
