package db

import "strconv"

// Rebind converts ? placeholders to $1...$n for postgres.
func Rebind(backend Backend, query string) string {
	if backend != BackendPostgres {
		return query
	}
	return rebindDollar(query)
}

func rebindDollar(query string) string {
	var b []byte
	b = make([]byte, 0, len(query)+8)
	arg := 1
	inSingle := false
	inDouble := false

	for i := 0; i < len(query); i++ {
		ch := query[i]
		switch ch {
		case '\'':
			if !inDouble {
				if inSingle && i+1 < len(query) && query[i+1] == '\'' {
					b = append(b, ch, query[i+1])
					i++
					continue
				}
				inSingle = !inSingle
			}
			b = append(b, ch)
		case '"':
			if !inSingle {
				inDouble = !inDouble
			}
			b = append(b, ch)
		case '?':
			if inSingle || inDouble {
				b = append(b, ch)
				continue
			}
			b = append(b, '$')
			b = strconv.AppendInt(b, int64(arg), 10)
			arg++
		default:
			b = append(b, ch)
		}
	}
	return string(b)
}
