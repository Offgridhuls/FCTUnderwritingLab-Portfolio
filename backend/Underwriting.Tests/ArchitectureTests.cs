using Underwriting.Application.Reviews;
using Underwriting.Domain.Reviews;
using Xunit;

namespace Underwriting.Tests;

public sealed class ArchitectureTests
{
    [Fact]
    public void DomainAndApplicationCannotDependOnHttpStorageOrModelTransport()
    {
        foreach (var assembly in new[] { typeof(Review).Assembly, typeof(ReviewCoordinator).Assembly })
            Assert.DoesNotContain(assembly.GetReferencedAssemblies(), dependency =>
                dependency.Name?.Contains("AspNetCore", StringComparison.Ordinal) == true ||
                dependency.Name?.Contains("Sqlite", StringComparison.Ordinal) == true ||
                dependency.Name?.Contains("Infrastructure", StringComparison.Ordinal) == true ||
                dependency.Name?.Contains("PdfPig", StringComparison.Ordinal) == true);
    }
}
