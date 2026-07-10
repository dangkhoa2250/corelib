import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";

import type { LibraryDocument } from "../domain/document";
import { importLocalDocuments, listDocuments } from "../lib/desktop";
import { LibraryPage } from "../features/library/LibraryPage";

export interface LibraryApi {
  list: () => Promise<LibraryDocument[]>;
  pick: () => Promise<string[] | null>;
  importDocuments: (paths: string[]) => Promise<LibraryDocument[]>;
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

export function App({ libraryApi = nativeLibraryApi }: AppProps) {
  const [documents, setDocuments] = useState<LibraryDocument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await libraryApi.list());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [libraryApi]);

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
      setDocuments((current) => mergeDocuments(current, imported));

      try {
        setDocuments(await libraryApi.list());
      } catch (refreshError) {
        setError(errorMessage(refreshError));
      }
    } catch (importError) {
      setError(errorMessage(importError));
    } finally {
      setImporting(false);
    }
  }, [importing, libraryApi]);

  return (
    <>
      <LibraryPage
        documents={documents ?? []}
        onOpen={() => {}}
        onImport={() => void handleImport()}
      />
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
