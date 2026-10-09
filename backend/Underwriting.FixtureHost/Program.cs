using Underwriting.Api;
using Underwriting.Application.Abstractions;
using Underwriting.FixtureHost;

// Test-only executable: production never enables a fake model through an environment flag.
await ApplicationBootstrap.Build(args, services => services.AddSingleton<IModelClient, SharedFixtureModel>()).RunAsync();
