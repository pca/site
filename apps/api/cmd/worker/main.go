// Command worker runs scheduled WCA syncs and jobs queued from the admin.
//
//	worker                                run the scheduler and job queue (default)
//	worker sync [--force]                 sync the WCA export now
//	worker import --archive FILE          import a local WCA export zip
//	worker statistics                     classify competitions and rebuild statistics
//	worker assign-regions                 classify competitions only
//	worker seed-state --archive FILE | --manifest FILE
//	                                      record which export an existing database came from
//	worker init-db --from FILE [--archive FILE | --manifest FILE]
//	                                      create DB_PATH from a seed database if it does
//	                                      not exist yet, then build statistics
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/pca/backend/internal/config"
	"github.com/pca/backend/internal/db"
	"github.com/pca/backend/internal/jobs"
	"github.com/pca/backend/internal/worker"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cmd, args := "run", os.Args[1:]
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}
	flags := flag.NewFlagSet(cmd, flag.ExitOnError)
	force := flags.Bool("force", false, "download and import even when the export is unchanged")
	archive := flags.String("archive", "", "path to a WCA export zip")
	manifest := flags.String("manifest", "", "path to a database rebuild manifest")
	from := flags.String("from", "", "seed database copied to DB_PATH by init-db")
	if err := flags.Parse(args); err != nil {
		return err
	}

	if cmd == "init-db" {
		if *from == "" {
			return fmt.Errorf("init-db needs --from")
		}
		created, err := copyIfMissing(*from, cfg.DBPath)
		if err != nil {
			return err
		}
		if !created {
			log.Info("database already exists; nothing to do", "db", cfg.DBPath)
			return nil
		}
		log.Info("created database from seed", "db", cfg.DBPath, "seed", *from)
	}

	d, err := db.Open(ctx, cfg.DBPath)
	if err != nil {
		return err
	}
	defer d.Close()
	w, err := worker.New(cfg, d, log)
	if err != nil {
		return err
	}

	switch cmd {
	case "init-db":
		if *archive == "" && *manifest == "" {
			log.Warn("no --archive or --manifest given; statistics will be built after the first sync")
			return nil
		}
		state, err := w.SeedState(ctx, *archive, *manifest)
		if err != nil {
			return err
		}
		log.Info("recorded WCA export", "export_date", state.ExportDate, "sha256", state.ArchiveSHA256)
		return w.RunNow(ctx, jobs.KindStatistics, jobs.Options{})
	case "run":
		return w.Run(ctx)
	case "sync":
		return w.RunNow(ctx, jobs.KindSync, jobs.Options{Force: *force})
	case "import":
		if *archive == "" {
			return fmt.Errorf("import needs --archive")
		}
		path, err := filepath.Abs(*archive)
		if err != nil {
			return err
		}
		return w.RunNow(ctx, jobs.KindImportArchive, jobs.Options{Archive: path})
	case "statistics":
		return w.RunNow(ctx, jobs.KindStatistics, jobs.Options{})
	case "assign-regions":
		return w.RunNow(ctx, jobs.KindAssignRegions, jobs.Options{})
	case "seed-state":
		state, err := w.SeedState(ctx, *archive, *manifest)
		if err != nil {
			return err
		}
		fmt.Printf("Recorded WCA export %s (%s), archive %s.\n", state.ExportDate, state.ExportFormatVersion, state.ArchiveSHA256)
		return nil
	}
	return fmt.Errorf("unknown command %q (commands: run, sync, import, statistics, assign-regions, seed-state, init-db)", cmd)
}

// copyIfMissing copies src to dst unless dst exists, writing to a temporary
// file first so a partial copy is never mistaken for a database.
func copyIfMissing(src, dst string) (bool, error) {
	if _, err := os.Stat(dst); err == nil {
		return false, nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return false, err
	}
	in, err := os.Open(src)
	if err != nil {
		return false, err
	}
	defer in.Close()
	tmp := dst + ".seeding"
	out, err := os.Create(tmp)
	if err != nil {
		return false, err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return false, err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		os.Remove(tmp)
		return false, err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return false, err
	}
	return true, os.Rename(tmp, dst)
}
