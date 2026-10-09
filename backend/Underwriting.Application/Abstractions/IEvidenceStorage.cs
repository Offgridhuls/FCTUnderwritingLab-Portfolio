namespace Underwriting.Application.Abstractions;

public sealed record ExtractedPdf(List<string> Pages, List<string> Warnings);

public interface IPdfExtractor
{
    ExtractedPdf Extract(byte[] content);
}

public interface IPrivateFiles
{
    Task<string> SaveAsync(string owner, string id, byte[] content, CancellationToken cancellationToken);
    Task<byte[]> ReadAsync(string path, CancellationToken cancellationToken);
    void DeleteSession(string owner);
    void Delete(string path);
}
