import db, ingest, embedder, projector, story_thread, scorer, divergence, labeler, exporter, argparse, logging, sys, time
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="News Drift pipeline")
    parser.add_argument(
        "--refit",
        action = "store_true",
        help = "Force a full PaCMAP refit on all embeddings in the DB.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help = "Run all steps but skip writing to public/data/.",
    )
    return parser.parse_args()

def run_pipeline(refit: bool, dry_run: bool)-> None:
    db.init_db()
    n_ingested = ingest.poll_feeds()
    print("Ingested N new articles")

    n_embedded = embedder.embed_pending()
    if n_embedded>0:
        print("Embedded N articles")
    else:
        print("No new articles to embed, continuing")

    t0 = time.perf_counter()
    model = projector.ensure_model(refit = refit)

    n_projected = projector.project_pending(model)
    if n_projected>0:
        print("Projected N articles")
    else:
        print("No new articles to project, continuing")
    
    t0 = time.perf_counter()
    thread_ids = story_thread.build_threads()

    velocity_flags = scorer.compute_velocity_flags(thread_ids)
    divergence_data =divergence.compute_divergence(thread_ids)
    labels = labeler.generate_labels(thread_ids)
    if not dry_run:
        exporter.write_snapshot(velocity_flags, divergence_data, labels)
    else:
        print("Dry run, skipping export.")

if __name__ == "__main__":
    args = parse_args()
    run_pipeline(refit=args.refit, dry_run=args.dry_run)