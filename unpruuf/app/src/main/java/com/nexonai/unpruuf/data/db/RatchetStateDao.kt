package com.nexonai.unpruuf.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface RatchetStateDao {

    @Query("SELECT * FROM ratchet_state WHERE contactId = :contactId LIMIT 1")
    suspend fun getByContactId(contactId: String): RatchetStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(state: RatchetStateEntity)

    @Query("DELETE FROM ratchet_state WHERE contactId = :contactId")
    suspend fun deleteByContactId(contactId: String)
}
