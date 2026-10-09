using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Persistence;

namespace Underwriting.Infrastructure.Reviews;

public sealed class ReviewRecovery(SqliteDatabase database)
{
    public void Recover()
    {
        database.Transaction(() =>
        {
            foreach (var (owner, review) in database.Query("SELECT owner,data FROM records WHERE kind='review'", row => (row.GetString(0), StorageJson.Deserialize<Review>(row.GetString(1)))))
            {
                var changed = false;
                foreach (var activity in review.Activities.Where(activity => activity.State == "running")) { activity.State = "interrupted"; changed = true; }
                if (review.Status == "running")
                {
                    review.Status = "interrupted";
                    review.Error = "Server stopped during review. Start a new review; partial evidence and messages are preserved.";
                    changed = true;
                }
                if (changed) database.Execute("UPDATE records SET data=$data WHERE kind='review' AND owner=$owner AND id=$id", ("$data", StorageJson.Serialize(review)), ("$owner", owner), ("$id", review.Id));
            }
            foreach (var (owner, intervention) in database.Query("SELECT owner,data FROM records WHERE kind='intervention'", row => (row.GetString(0), StorageJson.Deserialize<Intervention>(row.GetString(1)))))
            {
                if (intervention.State is not ("queued" or "processing")) continue;
                intervention.State = "failed";
                intervention.Error = "Server stopped before this intervention completed. Submit again against the current revision.";
                database.Execute("UPDATE records SET data=$data WHERE kind='intervention' AND owner=$owner AND id=$id", ("$data", StorageJson.Serialize(intervention)), ("$owner", owner), ("$id", intervention.Id));
                var affected = database.Query("SELECT data FROM records WHERE kind='review' AND id=$id AND owner=$owner",
                    row => StorageJson.Deserialize<Review>(row.GetString(0)), ("$id", intervention.ReviewId), ("$owner", owner)).FirstOrDefault();
                if (affected is not null)
                {
                    affected.NeedsRerun = true;
                    affected.Error = "Server stopped during a human challenge. The preserved brief may not include that intervention. Start a new review.";
                    database.Execute("UPDATE records SET data=$data WHERE kind='review' AND owner=$owner AND id=$id", ("$data", StorageJson.Serialize(affected)), ("$owner", owner), ("$id", affected.Id));
                }
            }
            return true;
        });
    }
}
