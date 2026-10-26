package com.nexonai.unpruuf.di

import android.content.Context
import androidx.room.Room
import com.nexonai.unpruuf.data.db.AppDatabase
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.db.DbKeyResult
import com.nexonai.unpruuf.data.db.DbKeyState
import com.nexonai.unpruuf.data.db.DbKeyVault
import com.nexonai.unpruuf.data.db.GroupDao
import com.nexonai.unpruuf.data.db.RatchetStateDao
import com.nexonai.unpruuf.data.db.SecureDeleteHook
import com.nexonai.unpruuf.data.db.SharedPrefsDbKeyPrefs
import com.nexonai.unpruuf.data.db.SqlCipherDbFiles
import com.nexonai.unpruuf.domain.network.CryptoManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    private const val DB_NAME = "unpruuf_contacts.db"

    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context,
        crypto: CryptoManager,
        keyState: DbKeyState
    ): AppDatabase {
        SQLiteDatabase.loadLibs(context)
        // The SQLCipher key is sealed under the phone-bound key; a plain key from an older version
        // is migrated here once (rekey to a fresh key, with a file copy as safety net). See DbKeyVault.
        val result = DbKeyVault(
            prefs = SharedPrefsDbKeyPrefs(context.getSharedPreferences(DbKeyVault.PREFS_NAME, Context.MODE_PRIVATE)),
            files = SqlCipherDbFiles(context.getDatabasePath(DB_NAME)),
            seal = { crypto.encrypt(it) },
            open = { crypto.decrypt(it) }
        ).resolve()
        return when (result) {
            is DbKeyResult.Ready -> Room.databaseBuilder(context, AppDatabase::class.java, DB_NAME)
                .openHelperFactory(SupportFactory(result.passphrase, SecureDeleteHook))
                .addMigrations(com.nexonai.unpruuf.data.db.MIGRATION_10_11, com.nexonai.unpruuf.data.db.MIGRATION_11_12, com.nexonai.unpruuf.data.db.MIGRATION_12_13, com.nexonai.unpruuf.data.db.MIGRATION_13_14, com.nexonai.unpruuf.data.db.MIGRATION_14_15, com.nexonai.unpruuf.data.db.MIGRATION_15_16)
                .fallbackToDestructiveMigration()
                .build()
            is DbKeyResult.Lost -> {
                // Phone key gone: never create a new file over the old one. The app runs on an empty
                // database in memory and the lock screen asks to clear the app data (PIN_STORE_LOST).
                keyState.markLost()
                Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
            }
        }
    }

    @Provides
    fun provideContactDao(db: AppDatabase): ContactDao = db.contactDao()

    @Provides
    fun provideGroupDao(db: AppDatabase): GroupDao = db.groupDao()

    @Provides
    fun provideRatchetStateDao(db: AppDatabase): RatchetStateDao = db.ratchetStateDao()
}
