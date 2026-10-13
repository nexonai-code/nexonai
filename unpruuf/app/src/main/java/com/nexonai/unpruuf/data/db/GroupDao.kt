package com.nexonai.unpruuf.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.nexonai.unpruuf.data.model.GroupEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface GroupDao {
    @Query("SELECT * FROM chat_groups ORDER BY name ASC")
    fun observeAll(): Flow<List<GroupEntity>>

    @Query("SELECT * FROM chat_groups")
    suspend fun getAllOnce(): List<GroupEntity>

    @Query("SELECT * FROM chat_groups WHERE id = :id")
    suspend fun getById(id: String): GroupEntity?

    @Query("SELECT * FROM chat_groups WHERE id = :id")
    fun observeById(id: String): Flow<GroupEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(group: GroupEntity)

    @Query("DELETE FROM chat_groups WHERE id = :id")
    suspend fun deleteById(id: String)
}
