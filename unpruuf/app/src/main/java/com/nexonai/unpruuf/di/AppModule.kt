package com.nexonai.unpruuf.di

import android.content.Context
import androidx.room.Room
import com.nexonai.unpruuf.data.db.AppDatabase
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.db.RatchetStateDao
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

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        SQLiteDatabase.loadLibs(context)
        val passphrase = getOrCreateDbKey(context)
        val factory = SupportFactory(passphrase)
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "unpruuf_contacts.db"
        )
            .openHelperFactory(factory)
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideContactDao(db: AppDatabase): ContactDao = db.contactDao()

    @Provides
    fun provideRatchetStateDao(db: AppDatabase): RatchetStateDao = db.ratchetStateDao()

    private fun getOrCreateDbKey(context: Context): ByteArray {
        val prefs = context.getSharedPreferences("db_key_store", Context.MODE_PRIVATE)
        val stored = prefs.getString("db_key", null)
        return if (stored != null) {
            android.util.Base64.decode(stored, android.util.Base64.DEFAULT)
        } else {
            val key = ByteArray(32)
            java.security.SecureRandom().nextBytes(key)
            prefs.edit()
                .putString("db_key", android.util.Base64.encodeToString(key, android.util.Base64.DEFAULT))
                .apply()
            key
        }
    }
}
