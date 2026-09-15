import { openDB } from "idb";


const DB_NAME =
  "vku-field-survey";


const DB_VERSION = 3;


const STORE_NAME =
  "surveys";


const dbPromise =
  openDB(
    DB_NAME,
    DB_VERSION,
    {

      upgrade(db) {

        if (
          !db.objectStoreNames
            .contains(STORE_NAME)
        ) {

          db.createObjectStore(
            STORE_NAME,
            {
              keyPath: "id",
            }
          );
        }
      },
    }
  );


// =====================================================
// SAVE
// =====================================================

export async function saveSurvey(
  survey
) {

  const db =
    await dbPromise;

  await db.put(
    STORE_NAME,
    survey
  );
}


// =====================================================
// GET ALL
// =====================================================

export async function getSurveys() {

  const db =
    await dbPromise;

  return db.getAll(
    STORE_NAME
  );
}


// =====================================================
// GET PENDING
// =====================================================

export async function getPendingSurveys() {

  const db =
    await dbPromise;

  const surveys =
    await db.getAll(
      STORE_NAME
    );


  return surveys.filter(
    survey =>
      survey.syncStatus ===
      "pending" ||

      survey.syncStatus ===
      "deleted"
  );
}


// =====================================================
// UPDATE
// =====================================================

export async function updateSurvey(
  survey
) {

  const db =
    await dbPromise;

  await db.put(
    STORE_NAME,
    survey
  );
}


// =====================================================
// DELETE LOCAL
// =====================================================

export async function deleteSurvey(
  id
) {

  const db =
    await dbPromise;

  await db.delete(
    STORE_NAME,
    id
  );
}