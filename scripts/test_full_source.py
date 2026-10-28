import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('full_import', Path(__file__).with_name('import-full-source.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StreamingParserTest(unittest.TestCase):
    def parse(self, content):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'sample.sql'
            path.write_text(content, encoding='utf-8')
            return list(module.records(path, 'sample'))

    def test_cross_chunk_string_and_multiple_inserts(self):
        value = '甲' * (1024 * 1024 + 10)
        rows = self.parse("INSERT INTO qiaoliang.sample (id,content) VALUES\n(1,'" + value + "'),\n"
                          "(2,'a''b,);\nINSERT INTO qiaoliang.fake');\n"
                          "INSERT INTO qiaoliang.sample (id,content) VALUES (3,NULL);")
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][1], ['1', value])
        self.assertEqual(rows[1][1], ['2', "a'b,);\nINSERT INTO qiaoliang.fake"])
        self.assertEqual(rows[2][1], ['3', None])

    def test_rejects_executable_sql(self):
        with self.assertRaises(ValueError):
            self.parse('INSERT INTO qiaoliang.sample (id) VALUES (1); DROP TABLE other;')
        with self.assertRaises(ValueError):
            self.parse('INSERT INTO qiaoliang.wrong (id) VALUES (1);')

    def test_export_binary_file_reference(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'sample0929.sql'
            (path.parent / 'files').mkdir()
            (path.parent / 'files/sample0929.sql-1.data').write_bytes(b'')
            path.write_text(r'INSERT INTO qiaoliang.sample (id,blob) VALUES (1,@E:\ql\1\files\sample0929.sql-1.data);', encoding='utf-8')
            self.assertEqual(list(module.records(path, 'sample'))[0][1], ['1', b''])


if __name__ == '__main__':
    unittest.main()
