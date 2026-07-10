import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LibraryDocument } from "../domain/document";
import { importLocalDocuments, listDocuments, searchDocuments } from "../lib/desktop";
import { LibraryPage } from "../features/library/LibraryPage";
import { ReaderPlaceholder } from "../features/reader/ReaderPlaceholder";
import { CommandPalette } from "../features/search/CommandPalette";

export interface LibraryApi {
  list: () => Promise<LibraryDocument[]>;
  pick: () => Promise<string[] | null>;
  importDocuments: (paths: string[]) => Promise<LibraryDocument[]>;
  search?: (query: string) => Promise<LibraryDocument[]>;
}

async function pickLocalPdfs(): Promise<string[] | null> {
  const selection = await open({
    title: "Import PDFs",
    multiple: true,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (selection === null) {
    return null;
  }

  return Array.isArray(selection) ? selection : [selection];
}

const nativeLibraryApi: LibraryApi = {
  list: listDocuments,
  pick: pickLocalPdfs,
  importDocuments: importLocalDocuments,
  search: searchDocuments,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeDocuments(
  current: LibraryDocument[] | null,
  imported: LibraryDocument[],
): LibraryDocument[] {
  const documents = new Map((current ?? []).map((document) => [document.id, document]));
  for (const document of imported) {
    documents.set(document.id, document);
  }
  return [...documents.values()];
}

interface AppProps {
  libraryApi?: LibraryApi;
}

type AppRoute =
  | { name: "library" }
  | { name: "reader"; document: LibraryDocument };

export function App({ libraryApi = nativeLibraryApi }: AppProps) {
  const [documents, setDocuments] = useState<LibraryDocument[] | null>(null);
  const [route, setRoute] = useState<AppRoute>({ name: "library" });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const loadedDocuments = await libraryApi.list();
      if (currentRequestId === requestId.current) {
        setDocuments(loadedDocuments);
      }
    } catch (loadError) {
      if (currentRequestId === requestId.current) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
      }
    }
  }, [libraryApi, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImport = useCallback(async () => {
    if (importing) {
      return;
    }

    setError(null);
    setImporting(true);
    try {
      const paths = await libraryApi.pick();
      if (!paths || paths.length === 0) {
        return;
      }

      const imported = await libraryApi.importDocuments(paths);
      requestId.current += 1;
      setDocuments((current) => mergeDocuments(current, imported));
      await load();
    } catch (importError) {
      setError(errorMessage(importError));
    } finally {
      setImporting(false);
    }
  }, [importing, libraryApi, load]);

  const handleOpen = useCallback(
    (id: string) => {
      const document = documents?.find((candidate) => candidate.id === id);
      if (document) {
        setRoute({ name: "reader", document });
      } else {
        setError("This document is no longer available.");
      }
    },
    [documents],
  );

  const search = useCallback(
    async (query: string) => {
      const results = await (libraryApi.search ?? searchDocuments)(query);
      setDocuments((current) => mergeDocuments(current, results));
      return results;
    },
    [libraryApi],
  );

  const palette = <CommandPalette search={search} onOpen={handleOpen} />;

  if (route.name === "reader") {
    return (
      <>
        <ReaderPlaceholder
          document={route.document}
          onBack={() => setRoute({ name: "library" })}
        />
        {palette}
      </>
    );
  }

  return (
    <>
      <LibraryPage
        documents={documents ?? []}
        onOpen={handleOpen}
        onImport={() => void handleImport()}
      />
      {palette}
      {loading ? <p role="status" aria-label="Loading library">Loading library…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
